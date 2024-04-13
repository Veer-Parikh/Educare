const express = require('express')
const router = express.Router();
const { register,login,updateTeacher,delTeacher,teacherProfile,displayAll,uploadpfp } = require("./teacherController")
const { authenticateTokenTeacher } = require("../../middleware/auth")
const { upload } = require("../../middleware/multer")

router.post('/signup',register)
router.post('/login',login)
router.get('/teacherProfile',authenticateTokenTeacher,teacherProfile)
router.get('/displayAll',authenticateTokenTeacher,displayAll)
router.patch('/update',authenticateTokenTeacher,updateTeacher)
router.delete('/delete',authenticateTokenTeacher,delTeacher)
router.post('/uploadpic',authenticateTokenTeacher,upload.single('image'),uploadpfp)

module.exports = router;