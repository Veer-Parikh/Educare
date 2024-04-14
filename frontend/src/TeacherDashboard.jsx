import React from "react";
import { useState, useContext, useEffect } from "react";
import { Button, Card, CardContent, Grid, Typography } from "@mui/material";
import TSideBar from "./TSideBar";
import camera from "./images/camera.png";
import axios from "axios";
import EmailContext from './EmailContext';

function TeacherDashboard() {
    const [isPictureUploaded, setIsPictureUploaded] = useState(false);


      const { email } = useContext(EmailContext); // Get email from EmailContext

      const [profileData, setProfileData] = useState(null);
  
      useEffect(() => {
        console.log("emailll:" ,email);
          if (email) {
              // Fetch profile data from the server using the email
              axios.get(`http://localhost:5000/teacher/teacherProfile/${email}`)
                  .then(response => {
                      // Update state with fetched profile data
                      setProfileData(response.data);
                  })
                  .catch(error => {
                      console.error('Error fetching profile data:', error);
                  });
          }
      }, [email]);

    
     

    return(

        <div style={{ overflowY: 'auto' }}>
            <CardContent style={{padding:'0px'}}>
            <Grid container>
                <Card style={{width:'20%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#000',borderRadius:'0px'}}>
                <Grid item >
                    <TSideBar />
                </Grid>
                </Card>
                <Card style={{width:'80%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#F5F6FA'}}>
                <Grid item>
                {/* <Nav /> */}
                <Typography style={{fontSize:'210%',fontWeight:700,marginTop:'20px',textAlign:'left',marginLeft:'30px', marginBottom:'30px'}}>Profile</Typography>

                
                <Grid container>
                <Grid item xs={8}>

                <Card style={{marginBottom:'30px',  paddingTop:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#000'}}>
                <Grid container>
                <Grid item xs={4}>
                <Button  name="banner" component="label" className="buttonText1" style={{marginTop:'0px'}}>
               <img src={camera} style={{width:'120px',marginTop:'20px'}}/>
                  <input id="banner-upload" type="file"  inputProps={{ accept: "image/png, image/gif, image/jpeg, image/heic, image/jpg" }} style={{ display: 'none' }}/>
                  </Button>

                </Grid>
                <Grid item xs={8}>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500,color:'#fff'}}>Full Name</Typography>
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',textAlign:'left',paddingLeft:'15px',backgroundColor:'#D3D3D3'}}>
                <Typography>{profileData && profileData.fullname}</Typography>
                </Card>

               <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500,color:'#fff'}}>Teacher ID</Typography> 
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px'}}>
                <Typography>{profileData && profileData.exp}</Typography>
                </Card>
                </Grid>
                </Grid>
                </Card>

               
            
                </Grid>
               

                <Grid item xs={4}>
               <Card style={{marginBottom:'30px',  paddingTop:'20px', marginLeft:'10px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#000',textAlign:'left',paddingLeft:'15px',fontWeight:700}}>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500,color:'#fff'}}>Email</Typography>
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:700}}>
                <Typography>{profileData && profileData.email}</Typography>
                </Card>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500,color:'#fff'}}>Phone Number</Typography> 
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:700}}>
                <Typography>{profileData && profileData.phone}</Typography>  
                 </Card>
                 </Card>

                </Grid>
                </Grid>
                
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>School Name</Typography> 
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:700}}> 
                <Typography>{profileData && profileData.schoolName}</Typography> 
                </Card>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Professional Summary</Typography>
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:700}}>
                <Typography>{profileData && profileData.desc}</Typography>   
                </Card>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Subjects</Typography>
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:700}}>
                <Typography>{profileData && profileData.subjects}</Typography> 
                </Card>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Experience (in yrs)</Typography>
                <Card style={{marginBottom:'30px', padding:'10px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%',backgroundColor:'#D3D3D3',textAlign:'left',paddingLeft:'15px',fontWeight:800}}>
                <Typography>{profileData && profileData.exp}</Typography>   
                </Card>
                
            
           
                </Grid>
                </Card>
            </Grid>
            </CardContent>
        </div>
    );

};

export default TeacherDashboard;