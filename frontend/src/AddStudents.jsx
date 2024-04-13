import React from "react";
import { Button, Card, CardContent, Grid, Typography } from "@mui/material";
import TSideBar from "./TSideBar";
import AddIcon from '@mui/icons-material/Add';
import Swal from "sweetalert2";

function Reviews() {

  const handleClick = () => {
    const { value: text } = Swal.fire({
        input: "text",
        inputLabel: "Username",
        inputPlaceholder: "Enter student's username you want to add",
        inputAttributes: {
          "aria-label": "Enter student's username you want to add"
        },
        showCancelButton: true,
        confirmButtonText: 'Add',
      });
      if (text) {
        Swal.fire(text);
      }
    }
    return(

        <div style={{ minHeight:'600px',overflowY: 'auto',height:'auto' }}>
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
                <Typography style={{fontSize:'210%',fontWeight:700,marginTop:'20px',textAlign:'left',marginLeft:'30px', marginBottom:'30px'}}>Add Students</Typography>

                <Button onClick={handleClick} style={{backgroundColor:'#ffc700',textDecoration:'none', color:'#000',display:'flex',justifyContent:'flex-start',marginLeft:'40px', marginBottom:'30px',padding:'8px'}}><Typography style={{fontWeight:600, marginRight:'10px',fontSize:'105%'}}>Add New Student</Typography><AddIcon /></Button>

                <Typography style={{textAlign:'left',marginLeft:'50px',marginBottom:'5px',fontWeight:500}}>My Students</Typography>
                <Card style={{marginBottom:'30px', padding:'20px', marginLeft:'40px',marginRight:'40px',borderRadius:'5px'}}>
                </Card>

                </Grid>
                </Card>
            </Grid>
            </CardContent>
        </div>
    );

};

export default Reviews;