const express = require('express')
const router = express.Router()
const { addStudent,delStudent,display,displayAll } = require("./teacherStudentControlller")

router.post('/addStudent',addStudent) 
router.delete('/delete/:email',delStudent)
router.get('/myStudent/:email',display)
router.get('/all',displayAll)

module.exports = router