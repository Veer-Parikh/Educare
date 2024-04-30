const express = require('express')
const router = express.Router();
const { register,login,updateuser,deluser,myProfile,myProfile2,displayAll,uploadpfp } = require("./userController")
const { upload } = require("../../middleware/multer")

router.post('/signup',register)
//user signup compulsory fields : username,email,password,fullname,board,schoolName,standard(number),rollNo(number)
router.post('/login',login)
//user login you get token in the response
router.get('/myProfile/:email',myProfile)
router.get('/my/:username',myProfile2)

router.get('/display',displayAll)
//get all students profiles
router.patch('/update/:email',updateuser)
//update any user info by giving user id
router.delete('/delete',deluser)
//delete the user 
router.post('/uploadpic/:email',upload.single('image'),uploadpfp)
//upload a photo

module.exports = router;