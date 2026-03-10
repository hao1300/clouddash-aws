const fs = require('fs');
const path = require('path');

const src = 'c:\\CS\\aws-console\\src-tauri\\icons\\128x128.png';
const dest = 'c:\\CS\\aws-console\\static\\logo.png';

try {
  fs.copyFileSync(src, dest);
  console.log('Logo copied successfully to ' + dest);
} catch (err) {
  console.error('Error copying logo:', err);
}
