'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const ALLOWED_EXT = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.docx', '.doc', '.png', '.jpg', '.jpeg']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    req._uploadDir = req._uploadDir || dir;
    cb(null, req._uploadDir);
  },
  filename(req, file, cb) {
    cb(null, file.originalname);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error(`File type not allowed: ${ext}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Accepts: store_file (single) + doc_files (up to 5)
const uploadFields = upload.fields([
  { name: 'store_file', maxCount: 1 },
  { name: 'doc_files',  maxCount: 5 },
]);

module.exports = { uploadFields };
