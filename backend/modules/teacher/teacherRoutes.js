const express = require('express')
const router = express.Router();
const { register,login,updateTeacher,delTeacher,teacherProfile,displayAll,uploadpfp } = require("./teacherController")
const { upload } = require("../../middleware/multer")

router.post('/signup',register)
router.post('/login',login)
router.get('/teacherProfile/:email',teacherProfile)
router.get('/displayAll',displayAll)
router.patch('/update/:email',updateTeacher)
router.delete('/delete',delTeacher)
router.post('/uploadpic/:email',upload.single('image'),uploadpfp)

module.exports = router;