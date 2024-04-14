const Teacher = require('./teacherSchema')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2

const register = async (req,res) => {
    try{
        const input = req.body;
        const teacher = new Teacher({
            email: input.email,
            phone: input.phone,
            password: input.password,
            fullname:input.fullname,
            desc:input.desc,
            schoolName:input.schoolName,
            exp:input.exp,
            subjects:input.subjects
        })
        teacher.password = await bcrypt.hash(teacher.password,10)
        await teacher.save()
        .then((savedUser) => {
            console.log("saved successfully")
            res.send(savedUser)
          })
          .catch((error) => {
            console.log(error)
            res.send("Error saving user")
          }) 
    }
    catch(error){
        console.log(error)
    }
}

const login = async (req,res) => {
    try{
        const { email, password } = req.body;
        const teacher = await Teacher.findOne({email:email})
        
        if (teacher) {
            const validpassword = await bcrypt.compare(password,teacher.password)
            if (validpassword) {
                const token=jwt.sign({_id:teacher._id},process.env.ACCESS_TOKEN) //,{expiresIn: "3h"}
                res.json(token);
            }
            else {
                return res.send("Invalid Password");
            }
        }
        else {
            return res.send("cannot find user")
        }
    }
    catch(error){
        res.send(error)    
    }
}

const displayAll = async(req,res) => {
    try {
        const teachers = await Teacher.find();
        res.send(teachers);
    } catch (error) {
        console.error(error);
            res.json(error);
    }
}

const updateTeacher = async (req,res) => {
    try {
        const user = await Teacher.findByIdAndUpdate(req.params.id,req.body,) ///
        if(user) {
            res.send("updation successful")
        }
        else {
            res.send("updation unsuccessful")
        }
    } catch (err) {
        res.send(err)
    }
}

const delTeacher = async (req,res) => {
    try {
        const user = await Teacher.findByIdAndDelete(req.body.id) ///
        if(user) {
            res.send("deletion successful")
        }
        else {
            res.send("deletion unsuccessful")
        }
    } catch (err) {
        res.send(err)
    }
}

const teacherProfile = async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ email: req.params.email }); ///
        if (!teacher) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(teacher);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}

const uploadpfp= async(req,res)=>{
    try {
        const result = await cloudinary.uploader.upload(req.file.path);
        const pfp = result.secure_url;

        const teacher = await Teacher.findOne({email:req.params.email}); ////
        teacher.pfp = pfp;
        await teacher.save();
        return res.send("Profile picture uploaded and saved.");
    } catch (error) {
        return res.status(500).send(error);
    }
}

cloudinary.config({
    cloud_name: "djnkpco73",
    api_key: "621582998277719",
    api_secret: "nzYw9Ll4H-L343skJ-E28k2K5zg",
})

module.exports = {register,login,updateTeacher,delTeacher,teacherProfile,displayAll,uploadpfp}