const Marks = require("./marksSchema")

const enterMarks = async (req,res) => {
    const input = req.body
    try {
        const marks = new Marks({
            userId:req.user._id,
            history:input.history,
            geography:input.geography,
            maths:input.maths,
            english:input.english,
            biology:input.biology,
            physics:input.physics,
            chemistry:input.chemistry
        })
        await marks.save()
        .then(() => {
            console.log("marks added successfully")
        })
        .catch((err) => {
            console.log(err)
        })
        res.send(marks)
    } catch(err) {
        console.log(err)
    }
}

const updateMarks = async (req,res) => {
    try {
        const marks = await Marks.findOneAndUpdate({userId:req.params.id},req.body,)
        if(marks) {
            res.send("update successful")
        }
        else {
            res.send("updation unsuccessful")
        }
    } catch(err) {
        res.send(err)
    }
}

const delMarks = async (req,res) => {
    try {
        const marks = await Question.findByIdAndDelete(req.body.id)
        if(marks) {
            res.send("deletion successful")
        }
        else {
            res.send("deletion unsuccessful")
        }
    } catch (err) {
        res.send(err)
    }
}

const displayMarks = async (req, res) => {
    try {
        const marks = await Marks.findOne({ userId: req.params.id });
        if (marks) {
            res.send(marks);
        } else {
            res.status(404).send("Marks not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).json(error);
    }
};

module.exports = {enterMarks,updateMarks,delMarks,displayMarks}