import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TextField, Button, Card, CardContent, Grid, Typography } from '@mui/material';
import SSideBar from './SSideBar';

const genAI = new GoogleGenerativeAI("AIzaSyANwaMYJWvS90eqqBb_yJ3Hij4DLYvol4Q");

async function generateContent(subject, workHours, focus) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const result = await model.generateContent(`Based on my extra curriculares- ${subject}, sleep time-${workHours} and time spent in school- ${focus} can you give me a schedule i can follow daily accomodating what i mentioned .Give the output in a paragraph. Don't make any of the text bold.`);
  const response = await result.response;
  const text = await response.text();
  return text;
}

function TTRecomed() {
  const [subject, setSubject] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [focus, setFocus] = useState('');
  const [recommendations, setRecommendations] = useState('');

  useEffect(() => {
    async function fetchData() {
      const generatedContent = await generateContent(subject, workHours, focus);
      setRecommendations(generatedContent);
    }
    if (subject && workHours && focus) {
      fetchData();
    }
  }, [subject, workHours, focus]);

  const handleSubjectChange = (event) => {
    setSubject(event.target.value);
  };

  const handleWorkHoursChange = (event) => {
    setWorkHours(event.target.value);
  };

  const handleFocusChange = (event) => {
    setFocus(event.target.value);
  };

  return (
    <div style={{ overflowY: 'auto' }}>
      <CardContent style={{ padding: '0px' }}>
        <Grid container>
          <Card style={{ width: '20%', minHeight: '800px', overflowY: 'auto', height: 'auto',backgroundColor: '#1e1e1e',borderRadius:'15px',margin:'15px' }}>
            <Grid item>
              <SSideBar />
            </Grid>
          </Card>
          
            <Grid item style={{width:'78%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#F5F6FA'}}>
              <Typography style={{ fontSize: '210%', fontWeight: 700, marginTop: '20px', textAlign: 'left', marginLeft: '30px', marginBottom: '30px' }}>Time Table Recommendations</Typography>
              
                  <TextField
                    label="Extracurriculars"
                    variant="outlined"
                    value={subject}
                    onChange={handleSubjectChange}
                    style={{ marginBottom: '20px', display: 'block',marginLeft:'40px' }}
                  />
                  <TextField
                    label="Sleep time"
                    variant="outlined"
                    value={workHours}
                    onChange={handleWorkHoursChange}
                    style={{ marginBottom: '20px', display: 'block' ,marginLeft:'40px'}}
                  />
                  <TextField
                    label="Time spent in school"
                    variant="outlined"
                    value={focus}
                    onChange={handleFocusChange}
                    style={{ marginBottom: '20px', display: 'block',marginLeft:'40px' }}
                  />
                  <Button variant="contained" onClick={() => { }} style={{backgroundColor:'#ffc700', color:'#000',marginLeft:'40px',marginTop:'40px'}}>
                    Get Recommendations
                  </Button>
                  {recommendations && (
                    <div style={{ marginTop: '20px', marginLeft: '20px', marginRight: '20px', textAlign: 'left', width: 'calc(100vw - 40px)' }}>
                      <h2>Generated Content:</h2>
                      {recommendations.split('.').map((sentence, index) => {
                        // Split the sentence by words
                        const words = sentence.split(' ');
                        return (
                          <p key={index}>
                            {words.map((word, wordIndex) => {
                              // Check if the word has asterisks (*) on both sides
                              const isBold = word.startsWith('*') && word.endsWith('*');
                              // Remove asterisks and render the word inside <strong> tag if it's bold
                              const cleanedWord = word.replace(/\*/g, '');
                              return (
                                <React.Fragment key={wordIndex}>
                                  {isBold ? <strong>{cleanedWord}</strong> : cleanedWord}&nbsp;
                                </React.Fragment>
                              );
                            })}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </Grid>
      
        </Grid>
      </CardContent>
    </div>
  );
}

export default TTRecomed;
