const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const app = express();
const port = 3000;

ffmpeg.setFfmpegPath(ffmpegPath);

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Timeout wrapper
const withTimeout = (handler, timeoutMs = 60000) => {
    return (req, res, next) => {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                console.error(`Request timed out after ${timeoutMs}ms`);
                res.status(504).json({ error: 'Request timed out' });
            }
        }, timeoutMs);
        res.on('finish', () => clearTimeout(timer));
        handler(req, res, next).catch(next);
    };
};

const { spawn } = require('child_process');
const path = require('path');

// Dynamically resolve yt-dlp path (works on Windows and Linux)
const ytDlpPath = require('youtube-dl-exec').create(path.join(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')).path;

// Helper to run yt-dlp and get JSON output
const getInfo = (url) => {
    return new Promise((resolve, reject) => {
        const args = [
            url,
            '--dump-single-json',
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats'
        ];

        console.log(`[DEBUG] Spawning: "${ytDlpPath}" with args: ${args.join(' ')}`);

        const process = spawn(ytDlpPath, args);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => stdout += data.toString());
        process.stderr.on('data', (data) => stderr += data.toString());

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error('Failed to parse yt-dlp output: ' + e.message));
                }
            } else {
                reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
            }
        });

        process.on('error', (err) => reject(err));
    });
};

app.get('/info', withTimeout(async (req, res) => {
    const videoUrl = req.query.url;
    console.log(`[INFO] Request: ${videoUrl}`);

    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    try {
        const output = await getInfo(videoUrl);

        res.json({
            title: output.title,
            thumbnail: output.thumbnail,
            author: output.uploader,
            lengthSeconds: output.duration // yt-dlp returns duration in seconds
        });
    } catch (err) {
        console.error('[INFO] Error Object:', err);
        const msg = err.message || err.stderr || 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch info: ' + msg });
    }
}));

app.get('/convert', async (req, res) => {
    const videoUrl = req.query.url;
    console.log(`[CONVERT] Request: ${videoUrl}`);

    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    // 2 min timeout for conversion
    const requestTimeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error('[CONVERT] Timeout reached!');
            res.status(504).json({ error: 'Conversion timed out' });
        }
    }, 120000);

    try {
        // 1. Get Info for filename
        const info = await getInfo(videoUrl);

        const title = info.title.replace(/[^\w\s-]/gi, '');
        console.log(`[CONVERT] Downloading: ${title}`);

        res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
        res.header('Content-Type', 'audio/mpeg');

        // 2. Stream download -> FFmpeg -> Response
        const args = [
            '-o', '-',
            '-f', 'bestaudio',
            '--no-check-certificates',
            '--no-warnings',
            videoUrl
        ];

        const ytDlpProcess = spawn(ytDlpPath, args);

        if (!ytDlpProcess.stdout) {
            throw new Error('Failed to spawn yt-dlp process');
        }

        const stream = ytDlpProcess.stdout;

        const command = ffmpeg(stream)
            .audioBitrate(128)
            .format('mp3')
            .on('start', () => console.log('[FFMPEG] Started'))
            .on('error', (err) => {
                console.error('[FFMPEG] Error:', err.message);
                if (!res.headersSent) res.status(500).json({ error: 'Conversion failed: ' + err.message });
            })
            .on('end', () => {
                console.log('[FFMPEG] Finished');
                clearTimeout(requestTimeout);
                if (ytDlpProcess.pid) try { ytDlpProcess.kill(); } catch (e) { }
            });

        command.pipe(res, { end: true });

        // Log stderr from yt-dlp for debugging
        ytDlpProcess.stderr.on('data', (data) => console.error(`[YT-DLP STDERR] ${data}`));

    } catch (err) {
        clearTimeout(requestTimeout);
        console.error('[CONVERT] Catch Error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Server Error: ' + err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

module.exports = app;
