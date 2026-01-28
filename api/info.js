const { spawn } = require('child_process');
const path = require('path');

// Dynamically resolve yt-dlp path
const ytDlpPath = require('youtube-dl-exec').create(path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')).path;

const getInfo = (url) => {
    return new Promise((resolve, reject) => {
        const args = [
            url,
            '--dump-single-json',
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats'
        ];
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
