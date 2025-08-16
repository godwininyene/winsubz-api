const multer = require('multer');
const path = require('path');
const AppError = require('./appError')

//Configuring multer storage
const storage = multer.diskStorage({
    destination:(req, file, cb)=>{
        if(file.fieldname === 'photo'){
            cb(null, 'public/img/users')
        }
    },
    filename:(req, file, cb)=>{
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`)
    }
});

//Configuring multer file filter with detailed error messages
const fileFilter = (req, file, cb)=>{
    const fieldname = file.fieldname;
    if(file.mimetype.startsWith("image")){
        cb(null, true)
    }else{
        cb(
            new AppError('Invalid file type', {fieldname: `${fieldname} must be an image (JPEG, PNG, GIF)`}, 400)
        )
    }
}
//Confuring multer upload 
const upload = multer({
    storage,
    fileFilter
})

//Upload user photo
exports.uploadProfilePhoto = upload.single("photo");