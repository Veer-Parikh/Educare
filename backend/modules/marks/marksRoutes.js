const express = require('express')
const router = express.Router()
const { enterMarks,updateMarks,delMarks,displayMarks } = require("./marksController")
const {authenticateToken,authenticateTokenTeacher} = require('../../middleware/auth')

router.post('/addStudent',authenticateToken,enterMarks)
router.delete('/delete',authenticateToken,delMarks)
router.get('/myStudent/:id',authenticateTokenTeacher,displayMarks)
router.patch('/update/:id',authenticateTokenTeacher,updateMarks)

module.exports = router