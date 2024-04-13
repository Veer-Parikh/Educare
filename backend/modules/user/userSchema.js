const { ObjectId } = require('mongodb');
const mongoose = require('mongoose')

const schema = mongoose.Schema

const userSchema = new schema({
    username:{
        type: String,
        required: true,
        unique: true,
    },
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
    DOB:{
        type:String
    },
    desc:{
        type:String
    },
    schoolName:{
        type:String,
        required:true
    },
    standard:{
        type:Number,
        required:true,
    },
    board:{
        type:String,
        required:true
    },
    rollNo:{
        type:Number,
        required:true
    },
    gender:{
        type:String
    },
    // TeacherStudent:{
    //     type:ObjectId,
    //     ref:'TeacherStudent'
    // },
    // Marks:{
    //     type:ObjectId,
    //     ref:'Marks'
    // },
    interest:[{
        type: String,
        required:true
    }],
    type:[{
        type:String,
        required:true
    }]
},
{
    timestamps:true
})

module.exports = mongoose.model('User',userSchema)