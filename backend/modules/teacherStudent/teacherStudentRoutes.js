const express = require('express')
const router = express.Router()
const { addStudent,delStudent,display,displayAll } = require("./teacherStudentControlller")
const {authenticateTokenTeacher} = require('../../middleware/auth')

router.post('/addStudent',authenticateTokenTeacher,addStudent)
router.delete('/delete',authenticateTokenTeacher,delStudent)
router.get('/myStudent',authenticateTokenTeacher,display)
router.get('/all',authenticateTokenTeacher,displayAll)

module.exports = router