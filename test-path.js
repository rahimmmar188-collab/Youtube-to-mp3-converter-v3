const path = require('path');
try {
    const ytdl = require('youtube-dl-exec');
    console.log('youtube-dl-exec loaded');
    const customPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
    console.log('Checking path:', customPath);
    const fs = require('fs');
    console.log('File exists:', fs.existsSync(customPath));

    // Test create
    const instance = ytdl.create(customPath);
    console.log('Instance path:', instance.path);

    const ffmpegPath = require('ffmpeg-static');
    console.log('FFMPEG Path:', ffmpegPath);
    console.log('FFMPEG exists:', fs.existsSync(ffmpegPath));
} catch (e) {
    console.error('Error:', e);
}
