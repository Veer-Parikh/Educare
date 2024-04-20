import React, { useState } from "react";
import { Button, Card, CardContent, Grid, Typography, FormControl, Input } from "@mui/material";
import SSideBar from "./SSideBar";
import AddIcon from '@mui/icons-material/Add';
import Swal from "sweetalert2";
import questionsAnswers from "./data.json";

function Quiz() {
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [generateClicked, setGenerateClicked] = useState(false); // State to track if the Generate Quiz button is clicked
    const [userAnswers, setUserAnswers] = useState({}); // State to store user's answers
    const [answerStatus, setAnswerStatus] = useState({}); // State to store the correctness status of user's answers

    const handleUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const newFile = {
                name: file.name,
            };
            setUploadedFiles([...uploadedFiles, newFile]);
        }
    };

    const handleGenerateQuiz = () => {
        setGenerateClicked(true); // Set the state to indicate that Generate Quiz button is clicked
    };

    const handleAnswerChange = (event, questionId) => {
        const { value } = event.target;
        setUserAnswers({ ...userAnswers, [questionId]: value });
        checkAnswer(questionId, value);
    };

    const checkAnswer = (questionId, userAnswer) => {
        const correctAnswer = questionsAnswers.find(qa => qa.id === questionId)?.answer;
        if (userAnswer === correctAnswer) {
            setAnswerStatus({ ...answerStatus, [questionId]: 'correct' });
        } else {
            setAnswerStatus({ ...answerStatus, [questionId]: 'incorrect' });
        }
    };

    return (
        <div style={{ overflowY: 'auto' }}>
            <CardContent style={{ padding: '0px' }}>
                <Grid container>
                    <Card style={{ width: '20%', minHeight: '800px', overflowY: 'auto', height: 'auto', backgroundColor: '#1e1e1e', borderRadius: '15px',margin:'15px' }}>
                        <Grid item>
                            <SSideBar />
                        </Grid>
                    </Card>
                   
                        <Grid item style={{width:'78%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#F5F6FA'}}>
                            <Typography style={{ fontSize: '210%', fontWeight: 700, marginTop: '20px', textAlign: 'left', marginLeft: '30px', marginBottom: '30px' }}>Chapter Wise Quiz</Typography>
                            <div style={{ display: 'flex' }}>
                                <div>
                                    <Button name="banner" component="label" className="buttonText1" style={{ backgroundColor: '#ffc700', textDecoration: 'none', color: '#000', display: 'flex', justifyContent: 'flex-start', marginLeft: '40px', marginBottom: '20px', padding: '8px', width: '185px' }}>
                                        <Typography style={{ fontWeight: 600, marginRight: '10px', fontSize: '105%' }}>Add Document</Typography>
                                        <AddIcon />
                                        <input id="banner-upload" type="file" onChange={handleUpload} inputProps={{ accept: "application/pdf, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document" }} style={{ display: 'none' }} />
                                    </Button>
                                </div>
                                <div>
                                    {uploadedFiles.length > 0 && <Typography className="formSubHeadings" style={{ textDecoration: 'underline', textAlign: 'left', marginLeft: '15px', marginTop: '10px' }}>Document uploaded</Typography>}
                                </div>
                            </div>
                            <Button name="banner" component="label" className="buttonText1" onClick={handleGenerateQuiz} style={{ backgroundColor: '#000', textDecoration: 'none', color: '#ffc700', display: 'flex', justifyContent: 'flex-start', marginLeft: '40px', marginBottom: '20px', padding: '8px', width: '155px' }}>
                                <Typography style={{ fontWeight: 600, marginRight: '10px', fontSize: '105%' }}>Generate Quiz</Typography>
                            </Button>

                            {generateClicked && questionsAnswers.map((qa) => (
                                <Card key={qa.id} style={{ marginBottom: '30px', padding: '20px', marginLeft: '40px', marginRight: '40px', borderRadius: '15px', height: 'auto' }}>
                                    <Typography style={{ textAlign: 'center', fontWeight: 700, marginBottom: '5px' }}>Question</Typography>
                                    <Typography style={{ textAlign: 'left' }}>{qa.question}</Typography>

                                    <Typography style={{ textAlign: 'center', marginBottom: '5px', fontWeight: 700, marginTop: '20px' }}>Answer</Typography>
                                    <FormControl sx={{ mb: '10px' }} >
                                        <Input
                                            name={`answer_${qa.id}`}
                                            type="text"
                                            placeholder="Type your answer"
                                            onChange={(event) => handleAnswerChange(event, qa.id)}
                                            style={{ color: answerStatus[qa.id] === 'correct' ? 'green' : answerStatus[qa.id] === 'incorrect' ? 'red' : 'inherit' }}
                                        />
                                    </FormControl>
                                    {answerStatus[qa.id] === 'correct' && <Typography style={{ color: 'green' }}>Correct</Typography>}
                                    {answerStatus[qa.id] === 'incorrect' && <Typography style={{ color: 'red' }}>Incorrect</Typography>}
                                </Card>
                            ))}
                        </Grid>

                </Grid>
            </CardContent>
        </div>
    );
}

export default Quiz;
