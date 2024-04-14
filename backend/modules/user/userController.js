const User = require('./userSchema')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2

const register = async (req,res) => {
    try{
        const input = req.body;
        const user = new User({
            username: input.username,
            email: input.email,
            phone: input.phone,
            password: input.password,
            fullname:input.fullname,
            board:input.board,
            desc:input.desc,
            DOB:input.DOB,
            schoolName:input.schoolName,
            standard:input.standard,
            rollNo:input.rollNo,
            gender:input.gender,
            interest: input.interest,
            type:input.type
        })
        user.password = await bcrypt.hash(user.password,10)
        await user.save()
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
        const user = await User.findOne({email:email})
        
        if (user) {
            const validpassword = await bcrypt.compare(password,user.password)
            if (validpassword) {
                const token=jwt.sign({_id:user._id},process.env.ACCESS_TOKEN) //,{expiresIn: "3h"}
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
        const users = await User.find();
        res.send(users);
    } catch (error) {
        console.error(error);
            res.json(error);
    }
}

const updateuser = async (req,res) => {
    try {
        const user = await User.findOneAndUpdate({email:req.params.email} ,req.body,)////
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

const deluser = async (req,res) => {
    try {
        const user = await User.findByIdAndDelete(req.body.id)
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

const myProfile = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}

const uploadpfp= async(req,res)=>{
    try {
        const result = await cloudinary.uploader.upload(req.file.path);
        const pfp = result.secure_url;

        const user = await User.findOne({ email: req.params.email });////
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        user.pfp = pfp;
        await user.save();
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

module.exports = {register,login,updateuser,deluser,myProfile,displayAll,uploadpfp}