const express = require('express')
const router = express.Router();
const { register,login,updateuser,deluser,myProfile,displayAll,uploadpfp } = require("./userController")

const { authenticateToken } = require("../../middleware/auth")
const { upload } = require("../../middleware/multer")

router.post('/signup',register)
//user signup compulsory fields : username,email,password,fullname,board,schoolName,standard(number),rollNo(number)
router.post('/login',login)
//user login you get token in the response
router.get('/myProfile',authenticateToken,myProfile)
//get your own profile 
router.get('/display',authenticateToken,displayAll)
//get all students profiles
router.patch('/update',authenticateToken,updateuser)
//update any user info 
router.delete('/delete',authenticateToken,deluser)
//delete the user 
router.post('/uploadpic',authenticateToken,upload.single('image'),uploadpfp)
//upload a photo

module.exports = router;