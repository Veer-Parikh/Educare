import React from "react";
import { useState } from "react";
import { Button, Card, CardContent, Grid, Typography } from "@mui/material";
import TSideBar from "./TSideBar";
import camera from "./images/camera.png";


function TeacherDashboard() {
    const [isPictureUploaded, setIsPictureUploaded] = useState(false);
    const handlePictureUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
          setIsPictureUploaded(file);
        }
      };

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

                <Card style={{marginBottom:'30px',  paddingTop:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                <Grid container>
                <Grid item xs={4}>
                <Button  name="banner" component="label" className="buttonText1" style={{marginTop:'0px'}}>
               <img src={camera} style={{width:'120px',marginTop:'20px'}}/>
                  <input id="banner-upload" type="file" onChange={handlePictureUpload} inputProps={{ accept: "image/png, image/gif, image/jpeg, image/heic, image/jpg" }} style={{ display: 'none' }}/>
                  </Button>

                </Grid>
                <Grid item xs={8}>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Full Name</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                </Card>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Teacher ID</Typography> 
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                </Card>
                </Grid>
                </Grid>
                </Card>

               
            
                </Grid>
               

                <Grid item xs={4}>
               <Card style={{marginBottom:'30px',  paddingTop:'20px', marginLeft:'10px',marginRight:'40px',borderRadius:'5px'}}>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Email</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                    
                </Card>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Phone Number</Typography> 
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                 </Card>
                 </Card>

                </Grid>
                </Grid>
                
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>School Name</Typography> 
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}> 
                </Card>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Professional Summary</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%'}}>
                    
                </Card>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Subjects</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%'}}>
                   
                </Card>
                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>Experience (in yrs)</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px',height:'100%'}}>
                    
                </Card>
                
                
           
                </Grid>
                </Card>
            </Grid>
            </CardContent>
        </div>
    );

};

export default TeacherDashboard;