const fs = require("fs");
const path = require("path");

/**
 * Delete a file from the server
 * @param {string} fileUrl - Full file URL (e.g. http://127.0.0.1:9000/img/giftcards/cardImage-123.jpg)
 * @param {string} folder - The folder name inside /public/img (e.g. "giftcards")
 */
const deleteFile = (fileUrl, folder) => {
  if (!fileUrl) return;

  try {
    // Extract filename from URL
    const filename = fileUrl.split(`/img/${folder}/`)[1];
    if (!filename) return;

    // Build the absolute path
    const filePath = path.join(__dirname, "..", "public", "img", folder, filename);

    // Delete file asynchronously
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Failed to delete file: ${filePath}`, err.message);
      } else {
        console.log(`File deleted: ${filePath}`);
      }
    });
  } catch (error) {
    console.error("Error deleting file:", error.message);
  }
};

module.exports = deleteFile;
