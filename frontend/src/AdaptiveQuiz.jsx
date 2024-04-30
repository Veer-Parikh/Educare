import React, { useState, useEffect } from "react";
import { Button, Card, CardContent, Grid, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import fontcolorTheme from "./fontColorTheme"; // Import your custom theme
import SSideBar from "./SSideBar";

const questionsArray = [
  {
    "id": 1,
    "difficulty": 0,
    "question": "The equator passes through India.",
    "answer": false
  },
  {
    "id": 2,
    "difficulty": 0,
    "question": "The longest river in the world is the Nile.",
    "answer": true
  },
  {
    "id": 3,
    "difficulty": 0,
    "question": "Mount Everest is the highest mountain peak in the world.",
    "answer": true
  },
  {
    "id": 4,
    "difficulty": 0,
    "question": "The Great Barrier Reef is located in the Indian Ocean.",
    "answer": false
  },
  {
    "id": 5,
    "difficulty": 0,
    "question": "The Pacific Ocean is the largest ocean in the world.",
    "answer": true
  },
  {
    "id": 6,
    "difficulty": 0,
    "question": "The Sahara Desert is the largest desert in the world.",
    "answer": true
  },
  {
    "id": 7,
    "difficulty": 0,
    "question": "The Amazon River is the longest river in the world.",
    "answer": false
  },
  {
    "id": 8,
    "difficulty": 1,
    "question": "The Tropic of Capricorn passes through India.",
    "answer": false
  },
  {
    "id": 9,
    "difficulty": 1,
    "question": "The Gobi Desert is located in South America.",
    "answer": false
  },
  {
    "id": 10,
    "difficulty": 1,
    "question": "The Amazon Rainforest is also known as the 'Lungs of the Earth'.",
    "answer": true
  },
  {
    "id": 11,
    "difficulty": 1,
    "question": "Lake Victoria is the largest lake in Africa.",
    "answer": true
  },
  {
    "id": 12,
    "difficulty": 1,
    "question": "The Arctic Ocean is the smallest ocean in the world.",
    "answer": true
  }
];

function AdaptiveQuiz() {
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [correctAnswers, setCorrectAnswers] = useState(0);

  useEffect(() => {
    selectQuestions();
  }, []);

  const selectQuestions = () => {
    const shuffledQuestions = questionsArray.sort(() => Math.random() - 0.5);
    const selected = shuffledQuestions.slice(0, 5); // Selecting 5 questions
    setSelectedQuestions(selected);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setCorrectAnswers(0);
  };

  const handleAnswer = (answer) => {
    const currentQuestion = selectedQuestions[currentQuestionIndex];
    const isCorrect = answer === currentQuestion.answer;

    setAnswers({
      ...answers,
      [currentQuestion.id]: {
        answer,
        isCorrect
      }
    });

    if (isCorrect) {
      setCorrectAnswers(correctAnswers + 1);
    } else {
      // If wrong answer selected for a hard question, show a medium question
      if (currentQuestion.difficulty === 1 && currentQuestionIndex < selectedQuestions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        return;
      }
    }

    // Move to the next question
    if (currentQuestionIndex < selectedQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // If all questions answered, suggest tougher questions
      selectQuestions();
    }
  };

  return (
    <ThemeProvider theme={fontcolorTheme}>
      <div style={{ overflowY: 'auto' }}>
        <CardContent style={{ padding: '0px' }}>
          <Grid container>
            <Card style={{ width: '20%', minHeight: '800px', overflowY: 'auto', height: 'auto', backgroundColor: '#1e1e1e', borderRadius: '15px',margin:'15px' }}>
              <Grid item>
                <SSideBar />
              </Grid>
            </Card>
          
              <Grid item style={{width:'78%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#F5F6FA'}}>
                <Typography style={{ fontSize: '210%', fontWeight: 700, marginTop: '20px', textAlign: 'left', marginLeft: '30px', marginBottom: '30px' }}>Pace of Learning</Typography>

                {/* Display current question */}
                {selectedQuestions.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <Typography variant="h6" gutterBottom>
                      Question {currentQuestionIndex + 1}:
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                      {selectedQuestions[currentQuestionIndex].question}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      Difficulty: {selectedQuestions[currentQuestionIndex].difficulty === 0 ? 'Medium' : 'Hard'}
                    </Typography>
                  </div>
                )}

                {/* Display answer buttons */}
                <div>
                  <Button onClick={() => handleAnswer(true)} variant="contained"  style={{ marginRight: '10px',backgroundColor:'#ffc700',color:'#000' }}>True</Button>
                  <Button onClick={() => handleAnswer(false)} variant="contained" style={{backgroundColor:'#ffc700',color:'#000'}}>False</Button>
                </div>

                {/* Display total correct answers */}
                <Typography variant="h6" style={{ marginTop: '20px' }}>
                  Total Correct Answers: {correctAnswers}
                </Typography>
              </Grid>
       
          </Grid>
        </CardContent>
      </div>
    </ThemeProvider>
  );
}

export default AdaptiveQuiz;