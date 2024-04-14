const cloudinary = require('cloudinary').v2
const TeacherStudent = require('./teacherStudentSchema')

const addStudent = async (req,res) => {
    const input = req.body;
    try{
        const create = new TeacherStudent({
            teacherId:input.teacherId, ////
            userId:input.userId,
        })
        await create.save()
        .then(() => {
            console.log("student added successfully")
        })
        .catch((err) => {
            console.log(err)
        })
        res.send(create)
    } catch(err) {
        console.log(err)
    }
}

const delStudent = async (req,res) => {
    try {
        const student = await TeacherStudent.findByIdAndDelete(req.params.id) ////
        if(student) {
            res.send("deletion successful")
        }
        else {
            res.send("deletion unsuccessful")
        }
    } catch (err) {
        res.send(err)
    }
}

const display = async (req,res) => {
    try{
        const students = await TeacherStudent.find({teacherId:req.params.id}) ////
        res.send(students);
    } catch (error) {
        console.error(error);
        res.json(error);
    }
}

const displayAll = async (req,res) => {
    try{
        const students = await TeacherStudent.find()
        res.send(students);
    } catch (error) {
        console.error(error);
        res.json(error);
    }
}

// const uplaodPdf = async (req,res) => {
//     try {
//         const result = await cloudinary.uploader.upload(req.file.path);
//         const profilePicUrl = result.secure_url;

//         const user = await User.findById(req.user._id);
//         user.profilePicUrl = profilePicUrl;
//         await user.save();
//         return res.send("Profile picture uploaded and saved.");
//     } catch (error) {
//         return res.status(500).send(error);
//     }
// }

module.exports = { addStudent,delStudent,display,displayAll }

