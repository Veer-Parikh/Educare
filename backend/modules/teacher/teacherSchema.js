const { ObjectId } = require('mongodb');
const mongoose = require('mongoose')

const schema = mongoose.Schema

const teacherSchema = new schema({
    email:{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    },
    phone:{
        type: Number,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required:true,
    },
    pfp:{
        type:String,
    },
    fullname:{
        type:String,
        required:true,
        unique:true
    },
    desc:{
        type:String
    },
    schoolName:{
        type:String
    },
    exp:{
        type:Number,
        required:true,
    },
    subjects:[{
        type:String,
        required:true
    }],
    // TeacherStudent:{
    //     type:ObjectId,
    //     ref:'TeacherStudent'
    // },
    // Marks:{
    //     type:ObjectId,
    //     ref:'Marks'
    // }
},
{
    timestamps:true
})

module.exports = mongoose.model('Teacher',teacherSchema)