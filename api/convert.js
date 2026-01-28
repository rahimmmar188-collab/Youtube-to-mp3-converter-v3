const { spawn } = require('child_process');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

// Dynamically resolve yt-dlp path
const ytDlpPath = require('youtube-dl-exec').create(path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')).path;

const getInfo = (url) => {
    return new Promise((resolve, reject) => {
        const args = [url, '--dump-single-json', '--no-check-certificates', '--no-warnings'];
        const process = spawn(ytDlpPath, args);
        let stdout = '';
        process.stdout.on('data', (data) => stdout += data.toString());
        process.on('close', (code) => {
            if (code === 0) resolve(JSON.parse(stdout));
            else reject(new Error(`yt-dlp info failed`));
        });
        process.on('error', (err) => reject(err));
    });
};

module.exports = async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    try {
        const info = await getInfo(videoUrl);
        const title = info.title.replace(/[^\w\s-]/gi, '') || 'audio';

        res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
        res.setHeader('Content-Type', 'audio/mpeg');

        const args = [
            '-o', '-',
            '-f', 'bestaudio',
            '--no-check-certificates',
            '--no-warnings',
            videoUrl
        ];

        const ytDlpProcess = spawn(ytDlpPath, args);
        const stream = ytDlpProcess.stdout;

        const command = ffmpeg(stream)
            .audioBitrate(128)
            .format('mp3')
            .on('error', (err) => {
                console.error('[FFMPEG] Error:', err.message);
                if (!res.headersSent) res.status(500).send('Conversion failed');
            })
            .on('end', () => {
                if (ytDlpProcess.pid) try { ytDlpProcess.kill(); } catch (e) { }
            });

        command.pipe(res, { end: true });

    } catch (err) {
        console.error('[CONVERT] Error:', err);
        if (!res.headersSent) res.status(500).send('Server Error: ' + err.message);
    }
};
