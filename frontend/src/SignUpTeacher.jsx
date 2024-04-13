import React from "react";
import Box from '@mui/material/Box';
import Container from "@mui/material/Container";
import { ThemeProvider } from "@mui/material/styles";
import fontcolorTheme from "./fontColorTheme";
import { Button, Typography, FormControl, FormLabel, Input, Link } from "@mui/material";
import logo from "./images/educare.png";
import signup from "./images/signup.png";


function SignUpTeacher() {
    return (
        <ThemeProvider theme={fontcolorTheme}>
            <Box sx={{
                display: 'flex',
                flexDirection: 'row',
                height: '100vh'  // Set height to match the viewport height
            }}>
                <Container sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: {
                        xs: '0%',
                        sm: '40%',
                        md: '40%'
                    },
                    height: {
                        xs: '0%',
                        sm: '100%',
                        md: '100%'
                    },
                    p: {
                        xs: '0%'
                    },
                    bgcolor: '#000000',  // corrected color name
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
                       <img src={signup} style={{ maxWidth: '100%', maxHeight:'100%', objectFit: 'contain' }} alt="Sewing Machine" />
                    </Container>
                </Container>

                <Container sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: {
                        xs: '100%',
                        sm: '60%',
                    },
                    height: {
                        xs: '100%',
                        sm: '100%'
                    },
                    bgcolor: {xs:'#000000',sm:'white',md:'white'}  // corrected color name
                }}>
                    <main >
                        <Box
                            sx={{
                                width: 300,
                                mx: 'auto', // margin left & right
                                my: 4, // margin top & bottom
                                py: 3, // padding top & bottom
                                px: 2, // padding left & right
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                boxShadow: 'md',
                                bgcolor:'white',
                                borderRadius:'16px'
                            }}
                            variant="outlined"
                        >
                            <div sx={{ mb:'10px' }}>
                            <img src={logo} style={{width:'220px', marginBottom:'30px'}}/>
                            <Typography component="h1" style={{fontSize:'170%'}}>
                                    Sign in 
                                </Typography>
                            </div>

                            <FormControl sx={{ mb:'20px' }}>
                            <FormLabel sx={{ textAlign: "left" }}>Email</FormLabel>
                                <Input
                                    name="email"
                                    type="email"
                                    placeholder="johndoe@email.com"
                                />
                            </FormControl>

                            <FormControl sx={{ mb:'10px' }} >
                            <FormLabel sx={{ textAlign: "left" }}>Passsword</FormLabel>
                                <Input
                                    name="password"
                                    type="password"
                                    placeholder="password"
                                />
                            </FormControl>
                            <Link href="/loginTeacher">
                            <Button sx={{ mt: 1 }}>Sign up</Button>
                            </Link>
                            <Typography fontSize="body2" sx={{ alignSelf: 'center' }}>
                                Already have an account? 
                                <Link href="/loginTeacher" style={{color:'#000', textDecorationColor:'#ffc700', marginLeft:'10px'}}>Log in</Link>
                            </Typography>
                            <Typography fontSize="body2" sx={{ alignSelf: 'center' }}>
                                Go back to Home Page
                                <Link href="/" style={{color:'#000', textDecorationColor:'#ffc700', marginLeft:'10px'}}>Home</Link>
                            </Typography>
                        </Box>
                    </main>
                </Container>
            </Box>
        </ThemeProvider>
    );
};

export default SignUpTeacher;