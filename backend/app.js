const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const url= process.env.MONGO_URL;

mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true })
      .then(() => {
        console.log('Connected to MongoDB');
        app.listen(port, () => {
          console.log(`Server is running on port ${port}`);
        });
      })
      .catch((error) => {
        console.error('Error connecting to MongoDB', error);
})

app.use(
    cors({
        origin:'*'
    })
)

app.use(express.json());
app.use(bodyParser.json());

const userRouter = require('./modules/user/userRoutes')
app.use('/user',userRouter)

const teacherRouter = require('./modules/teacher/teacherRoutes')
app.use('/teacher',teacherRouter)

const marksRouter = require('./modules/marks/marksRoutes')
app.use('/marks',marksRouter)

const teacherStudentRouter = require('./modules/teacherStudent/teacherStudentRoutes')
app.use('/teacherStudent',teacherStudentRouter)