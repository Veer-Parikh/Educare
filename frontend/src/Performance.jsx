import React, { useState } from "react";
import { Button, Card, CardContent, Grid, Typography, Radio, RadioGroup, FormControl, FormControlLabel, TextField } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import fontcolorTheme from "./fontColorTheme"; // Import your custom theme
import SSideBar from "./SSideBar";
import axios from "axios"; // Import Axios

function Performance() {
    const [formData, setFormData] = useState({
        part_time_job: 0,
        extracurricular_activities: 0,
        absence_days: 0,
        weekly_self_study_hours: 0
    });
    const [finalTotal, setFinalTotal] = useState(null); // State to hold the final total

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData({
            ...formData,
            [name]: parseInt(value) // Parse the value as an integer
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        // Extract values from formData
        const { part_time_job, extracurricular_activities, absence_days, weekly_self_study_hours } = formData;

        // Convert numerical values to numbers
        const absenceDaysNumber = parseInt(absence_days);
        const selfStudyHoursNumber = parseInt(weekly_self_study_hours);

        // Validate input and set default values
        const absenceDaysValue = isNaN(absenceDaysNumber) ? 0 : absenceDaysNumber;
        const selfStudyHoursValue = isNaN(selfStudyHoursNumber) ? 0 : selfStudyHoursNumber;

        // Calculate the sum of inputs
        let total = (part_time_job ? 1 : 0) + (extracurricular_activities ? 1 : 0) + absenceDaysValue + selfStudyHoursValue;

        // Calculate the final total based on the specified ranges
        if (total <= 2) total = 1;
        else if (total <= 4) total = 2;
        else if (total <= 6) total = 3;
        else if (total <= 8) total = 4;
        else total = 5;

        // Set the final total in the state
        setFinalTotal(total);

        try {
            const response = await axios.post("https://bc15-35-227-115-82.ngrok-free.app/predict/", {
                part_time_job: part_time_job,
                extracurricular_activities: extracurricular_activities,
                absence_days: absenceDaysValue,
                weekly_self_study_hours: selfStudyHoursValue
            });

            console.log("API Response:", response.data);

            // If you want to display the API response, you can set it to a state variable
            // For example:
            // setApiOutput(response.data);
        } catch (error) {
            console.error("Error fetching API:", error);
        }
    };

    return (
        <ThemeProvider theme={fontcolorTheme}>
            <div style={{ overflowY: 'auto' }}>
                <CardContent style={{ padding: '0px' }}>
                    <Grid container>
                        <Card style={{ width: '20%', minHeight: '800px', overflowY: 'auto', height: 'auto', backgroundColor: '#1e1e1e',borderRadius:'15px',margin:'15px'}}>
                            <Grid item>
                                <SSideBar />
                            </Grid>
                        </Card>
                        
                            <Grid item style={{width:'78%',minHeight:'800px',overflowY: 'auto',height:'auto', backgroundColor:'#F5F6FA'}}>
                                <Typography style={{ fontSize: '210%', fontWeight: 700, marginTop: '20px', textAlign: 'left', marginLeft: '30px', marginBottom: '30px' }}>Performance</Typography>

                                {/* Form for performance inputs */}
                                <form onSubmit={handleSubmit} style={{ margin: "60px" }}>
                                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'left' }}>
                                        Part-time job
                                    </Typography>
                                    <RadioGroup
                                        aria-label="part_time_job"
                                        name="part_time_job"
                                        value={formData.part_time_job}
                                        onChange={handleChange}
                                        row
                                        required
                                    >
                                        <FormControlLabel value={1} control={<Radio />} label="Yes" />
                                        <FormControlLabel value={0} control={<Radio />} label="No" />
                                    </RadioGroup>

                                    <Typography variant="h6" gutterBottom sx={{ textAlign: 'left' }}>
                                        Extracurricular Activities
                                    </Typography>
                                    <RadioGroup
                                        aria-label="extracurricular_activities"
                                        name="extracurricular_activities"
                                        value={formData.extracurricular_activities}
                                        onChange={handleChange}
                                        row
                                        required
                                    >
                                        <FormControlLabel value={1} control={<Radio />} label="Yes" />
                                        <FormControlLabel value={0} control={<Radio />} label="No" />
                                    </RadioGroup>

                                    <TextField
                                        label="Absence Days (Out of 10)"
                                        name="absence_days"
                                        value={formData.absence_days}
                                        onChange={handleChange}
                                        fullWidth
                                        margin="normal"
                                        variant="outlined"
                                        required
                                    />

                                    <TextField
                                        label="Weekly Self-study Hours"
                                        name="weekly_self_study_hours"
                                        value={formData.weekly_self_study_hours}
                                        onChange={handleChange}
                                        fullWidth
                                        margin="normal"
                                        variant="outlined"
                                        required
                                    />
                                    <Button type="submit" variant="contained" color="primary">
                                        Submit
                                    </Button>
                                </form>

                                {/* Display the final total */}
                                {finalTotal !== null && (
                                    <Typography variant="h5" style={{ marginTop: "20px" }}>
                                        Final Total: {finalTotal}
                                    </Typography>
                                )}
                            </Grid>
                        
                    </Grid>
                </CardContent>
            </div>
        </ThemeProvider>
    );
}

export default Performance;