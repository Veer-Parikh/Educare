import React, { useState, useEffect } from "react";
import { Button, Card, CardContent, Grid, Typography, FormControl, Input } from "@mui/material";
import SSideBar from "./SSideBar";
import AddIcon from '@mui/icons-material/Add';
import Swal from "sweetalert2";

function Quiz() {
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [questionsAnswers, setQuestionsAnswers] = useState([]);
    const [quizGenerated, setQuizGenerated] = useState(false);

    const fetchData = async () => {
        try {
            const response = await fetch(`https://73e5-35-204-6-242.ngrok-free.app/generate_question_answer_pairs/`);
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const data = await response.();
            const allData = data.question_answer_pairs || [];

            console.log("Response Data:", allData);
            setQuestionsAnswers(allData);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [() => handleGenerateQuiz]);

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
        setQuizGenerated(true);
    };

    return (
        <div style={{ overflowY: 'auto' }}>
            <CardContent style={{ padding: '0px' }}>
                <Grid container>
                    <Card style={{ width: '20%', minHeight: '800px', overflowY: 'auto', height: 'auto', backgroundColor: '#000', borderRadius: '0px' }}>
                        <Grid item>
                            <SSideBar />
                        </Grid>
                    </Card>
                    <Card style={{ width: '80%', minHeight: '800px', overflowY: 'auto', height: 'auto', backgroundColor: '#F5F6FA' }}>
                        <Grid item>
                            <Typography style={{ fontSize: '210%', fontWeight: 700, marginTop: '20px', textAlign: 'left', marginLeft: '30px', marginBottom: '30px' }}>Quiz</Typography>
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
                            <Button name="banner" component="label" className="buttonText1" onClick={handleGenerateQuiz} style={{ backgroundColor: '#ffc700', textDecoration: 'none', color: '#000', display: 'flex', justifyContent: 'flex-start', marginLeft: '40px', marginBottom: '20px', padding: '8px', width: '185px' }}>
                                <Typography style={{ fontWeight: 600, marginRight: '10px', fontSize: '105%' }}>Generate Quiz</Typography>
                            </Button>

                            {quizGenerated && questionsAnswers.map((qa) => (
                                <Card key={qa.id} style={{ marginBottom: '30px', padding: '20px', marginLeft: '40px', marginRight: '40px', borderRadius: '15px', height: '100%' }}>
                                    <Typography style={{ textAlign: 'left', marginLeft: '50px', marginBottom: '5px', fontWeight: 500 }}>Question</Typography>
                                    <Typography style={{ textAlign: 'left', fontSize: '120%', fontWeight: 600 }}>{qa.question}</Typography>

                                    <Typography style={{ textAlign: 'left', marginLeft: '50px', marginBottom: '5px', fontWeight: 500 }}>Answer</Typography>
                                    <FormControl sx={{ mb: '10px' }} >
                                        <Input
                                            name="answer"
                                            type="text"
                                            placeholder="Type your answer"
                                        />
                                    </FormControl>

                                </Card>
                            ))}
                        </Grid>

                    </Card>
                </Grid>
            </CardContent>
        </div>
    );
}

export default Quiz;
