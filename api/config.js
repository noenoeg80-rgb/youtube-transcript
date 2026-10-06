// Public client config for the browser. GOOGLE_CLIENT_ID is an OAuth *client ID* (not a secret).
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    driveFolderName: process.env.DRIVE_FOLDER_NAME || 'materi apgred',
  }));
}
