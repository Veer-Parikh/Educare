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

function App() {

 
  return (
    <div className="App">
       <ThemeProvider theme={fontcolorTheme}>
         <Router> 
          <Routes>
  
            <Route path="/" element={<Home />} />
             <Route path="/addstudents" element={<AddStudents />} />
            {/* <Route path="/addneworders" element={<AddNewOrder />} /> */}
            <Route path="/loginTeacher" element={<LoginTeacher/>} />
            <Route path="/signupTeacher" element={<SignUpTeacher/>} />
            <Route path="/loginStudent" element={<LoginStudent/>} />
            <Route path="/signupStudent" element={<SignUpStudent/>} />
          </Routes>
        </Router>
        </ThemeProvider>
    </div>
  );
}

export default App;
