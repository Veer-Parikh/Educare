const jwt=require('jsonwebtoken')
const user = require('../modules/user/userSchema')
const teacher = require('../modules/teacher/teacherSchema')

const authenticateToken=async(req,res,next)=>{
    try {
        const authHeader= req.headers['authorization']
        const token= authHeader && authHeader.split(' ')[1]
        if(token== null){
            res.send("token null")
            return res.status(401)
        }
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
        req.user = decodedToken;
        next();
        
        
    } catch (error) {
        return 1
    }
}

const authenticateTokenTeacher=async(req,res,next)=>{
    try {
        const authHeader= req.headers['authorization']
        const token= authHeader && authHeader.split(' ')[1]
        if(token== null){
            res.send("token null")
            return res.status(401)
        }
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
        req.teacher = decodedToken;
        next();
    } catch (error) {
        return 1
    }
}
module.exports= {authenticateToken,authenticateTokenTeacher}