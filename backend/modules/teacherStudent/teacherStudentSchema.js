const { ObjectId } = require('mongodb');
const mongoose = require('mongoose')

const schema = mongoose.Schema

const teacherStudentSchema = new schema({
    userId:[{
        type : ObjectId,
        ref : 'User',
        required : true
    }],
    teacherId:{
        type : schema.Types.ObjectId,
        ref : 'Teacher',
        required : true
    },
    pdf:[{
        type:String,
    }]
},
{
    timestamps:true
})

module.exports = mongoose.model('TeacherStudent',teacherStudentSchema)