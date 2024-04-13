const express = require('express')
const router = express.Router()
const { enterMarks,updateMarks,delMarks,displayMarks } = require("./marksController")
const {authenticateToken} = require('../../middleware/auth')

router.post('/addStudent',authenticateToken,enterMarks)
router.delete('/delete',authenticateToken,delMarks)
router.get('/myStudent',authenticateToken,displayMarks)
router.patch('/update',authenticateToken,updateMarks)

module.exports = router