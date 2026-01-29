const { spawn } = require('child_process');
const path = require('path');

const getYtDlpPath = () => {
    if (process.platform === 'win32') {
        const winPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
        if (require('fs').existsSync(winPath)) return winPath;
    }
    try {
        const ytdl = require('youtube-dl-exec');
        if (ytdl.path) return ytdl.path;
    } catch (e) { }
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
        const args = [
            url,
            '--dump-single-json',
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats'
        ];
        const ytProcess = spawn(ytDlpPath, args);
        let stdout = '';
        let stderr = '';
        ytProcess.stdout.on('data', (data) => stdout += data.toString());
        ytProcess.stderr.on('data', (data) => stderr += data.toString());
        ytProcess.on('close', (code) => {
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
        ytProcess.on('error', (err) => reject(err));
    });
};

module.exports = async (req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'No URL provided' });

    try {
        const output = await getInfo(videoUrl);
        res.status(200).json({
            title: output.title,
            thumbnail: output.thumbnail,
            author: output.uploader,
            lengthSeconds: output.duration
        });
    } catch (err) {
        console.error('[INFO] Error:', err);
        res.status(500).json({ error: 'Failed to fetch info: ' + err.message });
    }
};
