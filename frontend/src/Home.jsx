import React from "react";
import Box from '@mui/material/Box';
import Container from "@mui/material/Container";

import { Button, Typography } from "@mui/material";
import { Link } from 'react-router-dom'; 

function Home() {
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: {
                xs: 'column',
                sm: 'column',  // for extra small screens
                md: 'row',  // for small screens
            },
            height: '100vh'  // Set height to match the viewport height
        }}>
            <Container sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: {
                    xs: '100%',
                    sm: '100%',
                    md: '50%'
                },
                height: {
                    xs:'50%',
                    md: '100%',
                    sm: '50%'
                },
                bgcolor: '#000000'  // corrected color name
            }}>
                
                <Container sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%', // Ensure the container takes up the full width
                    height: '100%', // Ensure the container takes up the full height
                    overflow: 'hidden' // Hide any overflow content      
                }}>
                    {/* <img src={sewing_machine} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} /> */}
                    <Link to="/loginTailor" style={{ textDecoration: 'none' }}>
                        <Button variant="contained" style={{padding:'20px',paddingTop:'7px',paddingBottom:'7px'}} sx={{ bgcolor: '#ffc700',maxWidth: { md:'80%',sm:'50%',xs:'50%'} }}><Typography style={{fontWeight:600,fontSize:'105%',color:'#000'}}>TEACHER</Typography></Button>
                    </Link>   
                    </Container>            
            </Container>

            <Container sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: {
                    xs: '100%',
                    sm: '100%',
                    md: '50%'
                },
                height: {
                    xs:'50%',
                    md: '100%',
                    sm: '50%'
                },
                bgcolor: '#ffffff'  // corrected color name
            }}>

                <Container sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%', // Ensure the container takes up the full width
                    height: '100%', // Ensure the container takes up the full height
                    overflow: 'hidden' // Hide any overflow content      
                }}>
                    {/* <img src={user1} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} /> */}
                    <Link to="/loginStudent" style={{ textDecoration: 'none' }}> 
                        <Button variant="contained" style={{padding:'20px',paddingTop:'7px',paddingBottom:'7px'}} sx={{ bgcolor: '#ffc700', maxWidth: { md:'100%',sm:'50%',xs:'50%'} }}><Typography style={{fontWeight:600,fontSize:'105%',color:'#000'}}>STUDENT</Typography></Button>
                    </Link>                  
                     </Container>
            </Container>
        </Box>
    );
};

export default Home;