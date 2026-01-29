const { spawn } = require('child_process');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const getYtDlpPath = () => {
    // 1. Check if we're on Windows
    if (process.platform === 'win32') {
        const winPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
        if (require('fs').existsSync(winPath)) return winPath;
    }

    // 2. Try the official package recommendation
    try {
        const ytdl = require('youtube-dl-exec');
        if (ytdl.path) return ytdl.path;
    } catch (e) { }

    // 3. Fallback to manual Linux paths (Vercel)
    const possiblePaths = [
        path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
        path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
        '/var/task/node_modules/youtube-dl-exec/bin/yt-dlp'
    ];

    for (const p of possiblePaths) {
        if (require('fs').existsSync(p)) return p;
    }

    return 'yt-dlp';
};

const ytDlpPath = getYtDlpPath();
console.log('[DEBUG] Path resolved to:', ytDlpPath);

const getInfo = (url) => {
    return new Promise((resolve, reject) => {
        const args = [url, '--dump-single-json', '--no-check-certificates', '--no-warnings'];
        const ytProcess = spawn(ytDlpPath, args);
        let stdout = '';
        ytProcess.stdout.on('data', (data) => stdout += data.toString());
        ytProcess.on('close', (code) => {
            if (code === 0) resolve(JSON.parse(stdout));
            else reject(new Error(`yt-dlp info failed with code ${code}`));
        });
        ytProcess.on('error', (err) => reject(err));
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
                if (!res.headersSent) res.status(500).json({ error: 'Conversion failed' });
            })
            .on('end', () => {
                if (ytDlpProcess.pid) try { ytDlpProcess.kill(); } catch (e) { }
            });

        command.pipe(res, { end: true });

    } catch (err) {
        console.error('[CONVERT] Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Server Error: ' + err.message });
    }
};
