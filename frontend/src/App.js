import { BrowserRouter as Router, Routes, Route } from "react-router-dom"; 
import './App.css';
import { ThemeProvider } from "@emotion/react";
import fontcolorTheme from "./fontColorTheme";
import TeacherDashboard from "./TeacherDashboard";
import AddStudents from "./AddStudents";
import { Navigate } from "react-router-dom";
import LoginStudent from "./LoginStudent";
import LoginTeacher from "./LoginTeacher";
import SignUpTeacher from "./SignUpTeacher";
import SignUpStudent from "./SignUpStudent";
import Home from "./Home";
import StudentDashboard from "./StudentDashboard";
import AddMaterial from "./AddMaterial";
import Quiz from "./Quiz"
import { EmailProvider } from './EmailContext';
import OtherComponent from "./OtherComponent";
import Performance from "./Performance";
import ScopeReco from "./ScopeRec";
import TTRecomed from "./TimeTableRec";
import Recommendations from "./MaterialRec";
import AdaptiveQuiz from "./AdaptiveQuiz";
function App() {

 
  return (
    <div className="App">
      
       <ThemeProvider theme={fontcolorTheme}>
       <EmailProvider>
         <Router> 
          <Routes>
            <Route path="/performance" element={<Performance />} /> 
            <Route path="/scoperecommendations" element={<ScopeReco />} /> 
            <Route path="/ttrecommendations" element={<TTRecomed />} /> 
            <Route path="/materialrecommendations" element={<Recommendations/>} /> 
            <Route path="/teacherDashboard" element={<TeacherDashboard />} />
            <Route path="/studentDashboard" element={<StudentDashboard />} />
            <Route path="/addstudents" element={<AddStudents />} />
            <Route path="/addmaterial" element={<AddMaterial/>} />
            <Route path="/quiz" element={<Quiz/>} />
            <Route path="/adaptive" element={<AdaptiveQuiz/>} />
            <Route path="/loginTeacher" element={<LoginTeacher/>} />
            <Route path="/signupTeacher" element={<SignUpTeacher/>} />
            <Route path="/loginStudent" element={<LoginStudent/>} />
            <Route path="/signupStudent" element={<SignUpStudent/>} />
            <Route path="/" element={<Home />} />
          </Routes>
        </Router>
        </EmailProvider>
        </ThemeProvider>
        
    </div>
  );
}

export default App;
