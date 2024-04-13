const { ObjectId } = require('mongodb');
const mongoose = require('mongoose')

const schema = mongoose.Schema

const teacherStudentSchema = new schema({
    userId:{
        type : ObjectId,
        ref : 'User',
        required : true
    },
    history:{
        type:Number,
        required:true
    },
    geography:{
        type:Number,
        required:true
    },
    maths:{
        type:Number,
        required:true
    },
    english:{
        type:Number,
        required:true
    },
    biology:{
        type:Number,
        required:true
    },
    physics:{
        type:Number,
        required:true
    },
    chemistry:{
        type:Number,
        required:true
    }  
},
{
    timestamps:true
})

module.exports = mongoose.model('Subject',teacherStudentSchema)