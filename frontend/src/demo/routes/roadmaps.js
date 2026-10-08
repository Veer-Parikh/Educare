// Port of backend/src/modules/roadmaps.js.
import { awardXp, badRequest, by, db, findOr404, forbidden, insert, notFound, remove, shortId, update, XP } from "../core.js";
import { route } from "../router.js";
import { think, topicInfo } from "../ai.js";

const LEVELS = ["beginner", "intermediate", "advanced"];

// Only well-known domains may carry direct links; everything else gets a search link in the UI.
const TRUSTED = /^(https:\/\/)(www\.)?(developer\.mozilla\.org|khanacademy\.org|youtube\.com|docs\.python\.org|react\.dev|nodejs\.org|w3schools\.com|freecodecamp\.org|coursera\.org|edx\.org|ocw\.mit\.edu|en\.wikipedia\.org|leetcode\.com|kaggle\.com|developer\.android\.com|learn\.microsoft\.com|docs\.oracle\.com|brilliant\.org|openstax\.org|ncert\.nic\.in|geeksforgeeks\.org|3blue1brown\.com|cs50\.harvard\.edu)(\/|$)/i;

// ---------------------------------------------------------------------------
// Simulated curriculum designer
// ---------------------------------------------------------------------------

// Stage: [title, description, topics, resources: [type, title, url?, note?][], project?]
const r = (type, title, url = null, note = null) => ({ type, title, url, note });

const TRACKS = [
  {
    keys: ["react", "frontend", "front-end", "web dev", "javascript"],
    outcome: "build, test and deploy production-quality React apps and talk through your decisions in an interview",
    stages: [
      ["Modern JavaScript refresher", "React is \"just JavaScript\", so solid ES2015+ habits make everything after this easier.", ["let/const and scope", "Arrow functions and closures", "Destructuring and spread", "Array map/filter/reduce", "Promises and async/await"], [r("docs", "MDN JavaScript Guide", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide"), r("article", "javascript.info — The Modern JavaScript Tutorial", null, "Free, very thorough")], "Build a small to-do list in plain JavaScript with add, complete and filter."],
      ["React fundamentals", "Learn to think in components: data flows down through props, and state drives what's on screen.", ["Components and JSX", "Props", "State with useState", "Handling events", "Rendering lists with keys"], [r("docs", "react.dev — Learn React", "https://react.dev/learn"), r("practice", "react.dev — Tutorial: Tic-Tac-Toe", "https://react.dev/learn/tutorial-tic-tac-toe")], "Rebuild your to-do app in React, split into at least four components."],
      ["Hooks and effects", "Effects connect React to the outside world; knowing when not to use one is half the skill.", ["useEffect and cleanup", "Refs with useRef", "Custom hooks", "Rules of hooks", "Avoiding unnecessary effects"], [r("docs", "react.dev — Synchronizing with Effects", "https://react.dev/learn/synchronizing-with-effects"), r("docs", "react.dev — You Might Not Need an Effect", "https://react.dev/learn/you-might-not-need-an-effect")], null],
      ["Routing and data fetching", "Real apps have pages and talk to APIs; handle loading and error states like a pro.", ["Client-side routing with React Router", "Fetching data from a REST API", "Loading, error and empty states", "Caching with TanStack Query"], [r("docs", "React Router — Tutorial", null, "Official docs"), r("docs", "TanStack Query — Overview", null, "Official docs")], "Build a movie search app that calls a public API and has a details page per movie."],
      ["Styling and accessible UI", "Interviewers notice polish: responsive layouts, keyboard support and sensible semantics.", ["Tailwind CSS utility classes", "Responsive layouts with flexbox and grid", "Semantic HTML and ARIA basics", "Focus management and keyboard navigation"], [r("docs", "MDN — Accessibility", "https://developer.mozilla.org/en-US/docs/Web/Accessibility"), r("docs", "Tailwind CSS docs", null)], null],
      ["State management and forms", "As apps grow, decide where state lives and keep forms predictable.", ["Lifting state up", "Context for shared state", "useReducer for complex updates", "Controlled forms and validation"], [r("docs", "react.dev — Managing State", "https://react.dev/learn/managing-state"), r("video", "React state management explained", null)], "Add a multi-step form with validation and a shared shopping cart to your movie app."],
      ["Testing and TypeScript", "Typed, tested components are what separates hobby code from job-ready code.", ["TypeScript basics for React", "Typing props and hooks", "Unit tests with Vitest", "Component tests with React Testing Library"], [r("docs", "TypeScript Handbook", null), r("docs", "Testing Library — React", null)], null],
      ["Portfolio project and interview prep", "Ship something you're proud of and practise explaining it.", ["Deploying to Vercel or Netlify", "Writing a strong README", "Common React interview questions", "Live-coding practice"], [r("course", "freeCodeCamp — Front End Development Libraries", "https://www.freecodecamp.org/learn"), r("practice", "LeetCode — JavaScript problems", "https://leetcode.com/")], "Deploy a polished, tested app with a README, then do two mock interviews walking through it."],
    ],
  },
  {
    keys: ["data science", "data analysis", "pandas", "numpy", "python"],
    outcome: "clean, explore and visualise real datasets in Python and build a first predictive model",
    stages: [
      ["Python foundations", "Get fluent with the core language so data tools feel natural later.", ["Variables and data types", "Control flow", "Functions", "Lists, dicts and comprehensions"], [r("docs", "The Python Tutorial", "https://docs.python.org/3/tutorial/"), r("course", "CS50's Introduction to Programming with Python", "https://cs50.harvard.edu/python/")], "Write a script that reads a CSV of your expenses and prints totals per category."],
      ["NumPy and Jupyter", "Vectorised arrays are the engine under every data library.", ["Jupyter notebooks", "NumPy arrays and dtypes", "Vectorisation and broadcasting", "Random numbers and simulation"], [r("docs", "NumPy: the absolute basics for beginners", null), r("video", "Jupyter Notebook tutorial", null)], null],
      ["Data wrangling with pandas", "Most of data science is getting data into shape — pandas is the tool for it.", ["Series and DataFrames", "Selecting and filtering", "groupby and aggregation", "Merging and joining", "Handling missing values"], [r("course", "Kaggle Learn — Pandas", "https://www.kaggle.com/learn/pandas"), r("book", "Python for Data Analysis (Wes McKinney)", null)], "Clean a messy public dataset and document every step in a notebook."],
      ["Visualisation", "Good charts reveal patterns and convince people; bad ones hide them.", ["matplotlib basics", "seaborn for statistical plots", "Choosing the right chart", "Labelling and colour"], [r("course", "Kaggle Learn — Data Visualization", "https://www.kaggle.com/learn/data-visualization"), r("article", "seaborn tutorial", null)], null],
      ["Statistics essentials", "Statistics tells you whether a pattern is real or just noise.", ["Distributions and summary statistics", "Sampling and the central limit theorem", "Correlation vs causation", "Hypothesis tests and p-values"], [r("course", "Khan Academy — Statistics and probability", "https://www.khanacademy.org/math/statistics-probability"), r("video", "StatQuest statistics fundamentals", null)], null],
      ["Exploratory data analysis project", "Put wrangling, visualisation and statistics together on one real question.", ["Asking a good question", "Cleaning and feature creation", "Visual exploration", "Writing up findings"], [r("practice", "Kaggle Datasets", "https://www.kaggle.com/datasets")], "Publish an EDA notebook answering one question about a dataset you care about."],
      ["Intro to machine learning", "Learn the workflow for training and fairly evaluating a predictive model.", ["scikit-learn workflow", "Train/test split", "Linear and logistic regression", "Accuracy, precision and recall", "Overfitting"], [r("course", "Kaggle Learn — Intro to Machine Learning", "https://www.kaggle.com/learn/intro-to-machine-learning"), r("docs", "scikit-learn user guide", null)], null],
      ["Capstone and storytelling", "Turn analysis into a story someone can act on.", ["Framing the problem", "Building a model end to end", "Communicating uncertainty", "Presenting results"], [r("practice", "Kaggle — Getting Started competitions", "https://www.kaggle.com/competitions"), r("article", "Storytelling with Data", null)], "End-to-end project: from raw data to a short slide deck with one clear recommendation."],
    ],
  },
  {
    keys: ["calculus", "derivative", "integral", "differentiation", "integration"],
    outcome: "differentiate and integrate confidently and use calculus to model rates of change and areas",
    stages: [
      ["Functions and graphs refresher", "Calculus is about how functions change, so be fluent with functions first.", ["Domain and range", "Linear, quadratic and exponential graphs", "Composition and inverses", "Transformations of graphs"], [r("course", "Khan Academy — Precalculus", "https://www.khanacademy.org/math/precalculus"), r("video", "3Blue1Brown — Essence of Calculus", "https://www.3blue1brown.com/topics/calculus")], null],
      ["Limits and continuity", "Limits are the foundation that makes derivatives and integrals precise.", ["Intuitive idea of a limit", "One-sided limits", "Limit laws", "Continuity", "Limits at infinity"], [r("course", "Khan Academy — Calculus 1", "https://www.khanacademy.org/math/calculus-1"), r("book", "OpenStax Calculus Volume 1", "https://openstax.org/details/books/calculus-volume-1")], "Make a one-page sheet of limit techniques with a worked example of each."],
      ["The derivative", "The derivative measures instantaneous rate of change — the gradient of a curve.", ["Average vs instantaneous rate", "First principles: $f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$", "Power rule", "Tangent lines"], [r("video", "3Blue1Brown — The paradox of the derivative", null), r("practice", "Khan Academy — Derivatives practice", "https://www.khanacademy.org/math/calculus-1")], null],
      ["Differentiation rules", "Product, quotient and chain rules let you differentiate almost anything.", ["Product rule", "Quotient rule", "Chain rule", "Derivatives of trig, exp and log", "Implicit differentiation"], [r("book", "OpenStax Calculus Vol. 1 — Ch. 3", "https://openstax.org/details/books/calculus-volume-1"), r("practice", "Paul's Online Math Notes — Derivatives", null)], "Solve 30 mixed differentiation problems and keep an error log."],
      ["Applications of derivatives", "Use derivatives to find maxima, minima and how linked quantities change.", ["Increasing/decreasing functions", "Stationary points", "Optimisation problems", "Related rates", "Curve sketching"], [r("course", "MIT OCW 18.01 Single Variable Calculus", null), r("video", "Optimisation problems explained", null)], null],
      ["Integration basics", "Integration accumulates change and finds areas — the reverse of differentiation.", ["Antiderivatives", "Riemann sums", "Definite integrals", "Fundamental theorem of calculus"], [r("video", "3Blue1Brown — Integration and the fundamental theorem", null), r("course", "Khan Academy — Integrals", "https://www.khanacademy.org/math/calculus-1")], null],
      ["Integration techniques and area", "Build a toolkit for harder integrals and apply them to areas.", ["Substitution", "Integration by parts", "Area between curves", "Volumes of revolution (intro)"], [r("book", "OpenStax Calculus Volume 2", "https://openstax.org/details/books/calculus-volume-2"), r("practice", "Integration practice set", null)], "Model a real quantity (e.g. distance from a velocity graph) using integrals."],
      ["Review and problem marathon", "Mixed, timed practice turns techniques into exam-ready skill.", ["Mixed practice", "Choosing a method", "Common traps", "Timed past-paper questions"], [r("practice", "Brilliant — Calculus Fundamentals", "https://brilliant.org/"), r("practice", "Past exam papers", null)], "Sit a full timed mock paper and review every mistake."],
    ],
  },
  {
    keys: ["jee", "mechanics", "neet"],
    outcome: "solve JEE-level mechanics problems systematically, from free-body diagrams to rotational dynamics",
    stages: [
      ["Units, dimensions and vectors", "Every mechanics problem rests on vectors and dimensional sanity checks.", ["SI units and dimensional analysis", "Significant figures and errors", "Vector addition and components", "Dot and cross products"], [r("book", "NCERT Physics Part 1 — Ch. 1–4", "https://ncert.nic.in/textbook.php"), r("book", "H.C. Verma — Concepts of Physics Vol. 1", null)], null],
      ["Kinematics in one dimension", "Master motion graphs and the equations of motion before adding a second dimension.", ["Displacement, velocity, acceleration", "$v = u + at$, $s = ut + \\tfrac12 at^2$, $v^2 = u^2 + 2as$", "Motion graphs", "Free fall"], [r("course", "Khan Academy — One-dimensional motion", "https://www.khanacademy.org/science/physics/one-dimensional-motion"), r("practice", "D.C. Pandey — Mechanics Vol. 1", null)], "Solve 25 kinematics problems; classify each by the equation that cracks it."],
      ["Projectile and relative motion", "Split 2D motion into independent components and handle moving frames.", ["Projectile range and max height", "Motion on an incline", "Relative velocity", "River–boat and rain–umbrella problems"], [r("course", "Khan Academy — Two-dimensional motion", "https://www.khanacademy.org/science/physics/two-dimensional-motion"), r("practice", "PhET Projectile Motion simulation", null)], null],
      ["Newton's laws and friction", "Free-body diagrams are the single most important JEE mechanics skill.", ["Free-body diagrams", "Newton's three laws", "Pulleys and constraint relations", "Static and kinetic friction", "Pseudo forces"], [r("book", "H.C. Verma — Ch. 5–6", null), r("course", "Khan Academy — Forces and Newton's laws", "https://www.khanacademy.org/science/physics/forces-newtons-laws")], "Build a personal library of 15 FBD templates (blocks, pulleys, wedges)."],
      ["Work, energy and power", "Energy methods often solve in two lines what forces take a page to do.", ["Work–energy theorem", "Conservative forces and potential energy", "Conservation of mechanical energy", "Power", "Vertical circular motion"], [r("course", "Khan Academy — Work and energy", "https://www.khanacademy.org/science/physics/work-and-energy"), r("practice", "JEE Main previous-year questions", null)], null],
      ["Momentum and collisions", "Conservation of momentum handles collisions, explosions and variable mass.", ["Impulse", "Centre of mass", "Elastic and inelastic collisions", "Coefficient of restitution"], [r("course", "Khan Academy — Impacts and linear momentum", "https://www.khanacademy.org/science/physics/linear-momentum"), r("book", "I.E. Irodov — Problems in General Physics", null, "For the brave")], null],
      ["Rotational motion", "Rotation mirrors linear motion — torque, moment of inertia and angular momentum.", ["Torque and equilibrium", "Moment of inertia and parallel-axis theorem", "Rolling without slipping", "Angular momentum conservation"], [r("course", "Khan Academy — Torque and angular momentum", "https://www.khanacademy.org/science/physics/torque-angular-momentum"), r("course", "MIT OCW 8.01 Classical Mechanics", "https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/")], "Solve 20 rolling and rotational-collision problems under timed conditions."],
      ["Gravitation and full mock tests", "Finish with gravitation, then consolidate everything under exam conditions.", ["Newton's law of gravitation", "Orbital and escape velocity", "Kepler's laws", "Full-length timed mocks"], [r("practice", "JEE Main/Advanced previous-year papers", null), r("book", "NCERT Physics Part 1 — Ch. 8", "https://ncert.nic.in/textbook.php")], "Take two full mechanics mock tests and log every error by concept."],
    ],
  },
  {
    keys: ["android", "kotlin", "mobile app"],
    outcome: "build and publish a modern Android app with Kotlin and Jetpack Compose",
    stages: [
      ["Kotlin basics", "Kotlin's null safety and concise syntax are the base of every modern Android app.", ["Variables and types", "Null safety", "Functions and lambdas", "Control flow"], [r("course", "Android Basics with Compose", "https://developer.android.com/courses/android-basics-compose/course"), r("docs", "Kotlin docs — Basic syntax", null)], null],
      ["Classes and collections", "Model your app's data cleanly with Kotlin's classes and collection APIs.", ["Classes and data classes", "Interfaces and inheritance", "Lists, maps and sets", "Higher-order collection functions"], [r("practice", "Kotlin Koans", null), r("docs", "Kotlin docs — Collections overview", null)], "Write a command-line quiz game in Kotlin."],
      ["Android Studio and your first app", "Learn the tooling and the anatomy of an Android project.", ["Android Studio tour", "Project structure and Gradle", "Running on an emulator and device", "Activities and lifecycle"], [r("docs", "Android Developers — Build your first app", "https://developer.android.com/courses/android-basics-compose/course")], null],
      ["UI with Jetpack Compose", "Compose builds UI from composable functions instead of XML layouts.", ["Composables and modifiers", "Rows, columns and lazy lists", "Material 3 components", "Theming"], [r("docs", "Jetpack Compose", "https://developer.android.com/jetpack/compose"), r("video", "Jetpack Compose crash course", null)], "Build a profile card and a scrolling list screen in Compose."],
      ["State and navigation", "Make screens interactive and move between them.", ["remember and mutableStateOf", "State hoisting", "ViewModel", "Navigation Compose"], [r("docs", "Android Developers — State in Compose", null)], null],
      ["Persistence with Room", "Store data locally so your app works offline.", ["Room entities and DAOs", "Flows", "Repository pattern", "DataStore for preferences"], [r("course", "Android Basics — Persistence with Room", "https://developer.android.com/courses/android-basics-compose/course")], "Add offline storage to a notes app."],
      ["Networking and coroutines", "Fetch data from the internet without freezing the UI.", ["Coroutines and suspend functions", "Retrofit", "JSON parsing", "Loading and error states"], [r("docs", "Kotlin coroutines guide", null), r("video", "Retrofit with Compose tutorial", null)], null],
      ["Polish and publish", "Ship it: test, optimise and publish to the Play Store.", ["Testing basics", "App icons and accessibility", "Release builds and signing", "Play Console listing"], [r("docs", "Android Developers — Publish your app", "https://developer.android.com/studio/publish")], "Publish a small app (or an internal test track) and gather feedback from three users."],
    ],
  },
  {
    keys: ["machine learning", "deep learning", "neural", " ai", "ml "],
    outcome: "understand, train and evaluate core machine-learning models and explain how they work",
    stages: [
      ["Python and maths refresher", "ML leans on Python, linear algebra and a little calculus — refresh just enough.", ["NumPy arrays", "Vectors and matrices", "Derivatives and gradients", "Probability basics"], [r("video", "3Blue1Brown — Essence of Linear Algebra", "https://www.3blue1brown.com/topics/linear-algebra"), r("course", "Khan Academy — Linear algebra", "https://www.khanacademy.org/math/linear-algebra")], null],
      ["Linear regression and gradient descent", "The simplest model teaches the core loop: predict, measure error, adjust.", ["Hypothesis and cost function", "Gradient descent", "Learning rate", "Feature scaling"], [r("course", "Machine Learning Specialization (Andrew Ng)", "https://www.coursera.org/specializations/machine-learning-introduction"), r("course", "Kaggle Learn — Intro to Machine Learning", "https://www.kaggle.com/learn/intro-to-machine-learning")], "Implement linear regression with gradient descent from scratch in NumPy."],
      ["Classification", "Predict categories and understand decision boundaries.", ["Logistic regression", "Sigmoid and log loss", "Decision boundaries", "Multiclass classification"], [r("docs", "scikit-learn — Linear models", null), r("video", "StatQuest — Logistic regression", null)], null],
      ["Model evaluation", "A model is only as good as how honestly you evaluate it.", ["Train/validation/test splits", "Cross-validation", "Precision, recall and F1", "Overfitting and regularisation"], [r("course", "Kaggle Learn — Intermediate Machine Learning", "https://www.kaggle.com/learn/intermediate-machine-learning")], null],
      ["Trees and ensembles", "Tree-based models are the workhorses of tabular data.", ["Decision trees", "Random forests", "Gradient boosting", "Feature importance"], [r("docs", "scikit-learn — Ensemble methods", null), r("video", "StatQuest — Random forests", null)], "Enter a Kaggle Getting Started competition with a tuned random forest."],
      ["Unsupervised learning", "Find structure in data without labels.", ["k-means clustering", "Principal component analysis", "Anomaly detection"], [r("docs", "scikit-learn — Clustering", null)], null],
      ["Neural networks", "See how layers of simple units learn complex functions.", ["Perceptrons and activation functions", "Backpropagation", "Training with PyTorch or Keras", "Overfitting in deep nets"], [r("video", "3Blue1Brown — Neural networks", "https://www.3blue1brown.com/topics/neural-networks"), r("course", "fast.ai — Practical Deep Learning", null)], null],
      ["End-to-end ML project", "Frame a problem, build a model, and communicate results responsibly.", ["Problem framing", "Data pipeline", "Model selection", "Bias, fairness and limitations"], [r("practice", "Kaggle Competitions", "https://www.kaggle.com/competitions")], "Build and write up an end-to-end ML project with a clear evaluation section."],
    ],
  },
  {
    keys: ["spanish", "español", "espanol"],
    outcome: "hold everyday conversations in Spanish about yourself, your plans and your past",
    stages: [
      ["Sounds and greetings", "Good pronunciation early saves you from relearning later.", ["Spanish vowels and the alphabet", "Greetings and introductions", "Numbers 1–100", "Basic courtesy phrases"], [r("practice", "Duolingo — Spanish", null), r("video", "Dreaming Spanish — Superbeginner", null)], null],
      ["Present tense and ser/estar", "Talk about who you are and how things are right now.", ["Regular -ar/-er/-ir verbs", "Ser vs estar", "Tener and common irregulars", "Gender and articles"], [r("article", "SpanishDict — Ser vs estar", null), r("practice", "Conjugation drills", null)], "Record a one-minute self-introduction."],
      ["Everyday vocabulary", "Build vocabulary for the situations you'll actually meet.", ["Food and ordering", "Shopping and prices", "Directions", "Time and dates"], [r("practice", "Anki — Spanish frequency deck", null), r("video", "Easy Spanish street interviews", null)], null],
      ["Questions and small talk", "Keep conversations going by asking questions back.", ["Question words", "Gustar and likes/dislikes", "Hobbies and routines", "Reflexive verbs"], [r("practice", "Language exchange partner (e.g. Tandem)", null)], "Have a 10-minute conversation with a language partner."],
      ["The past tense", "Tell stories about what happened — the preterite is your workhorse.", ["Preterite regular verbs", "Common irregular preterites", "Time expressions", "Intro to the imperfect"], [r("article", "SpanishDict — Preterite tense", null), r("video", "Dreaming Spanish — Beginner", null)], null],
      ["Listening practice", "Train your ear with native-speed content at your level.", ["Comprehensible input", "Podcasts for learners", "Shadowing technique"], [r("practice", "Coffee Break Spanish podcast", null)], null],
      ["Plans and opinions", "Talk about the future and say what you think.", ["Ir a + infinitive", "Simple future", "Giving opinions", "Agreeing and disagreeing"], [r("article", "SpanishDict — Future tense", null)], null],
      ["Conversation sprint", "Put it all together with daily speaking practice.", ["Daily speaking routine", "Fixing fossilised errors", "Role-play scenarios"], [r("practice", "iTalki community tutors", null)], "Hold a 20-minute conversation covering your past, present and future plans."],
    ],
  },
  {
    keys: ["system design", "distributed", "scalab", "architecture"],
    outcome: "reason about scalable systems and lead a structured system-design interview",
    stages: [
      ["Fundamentals and the interview framework", "Learn the vocabulary and a repeatable way to approach any design question.", ["Requirements and estimates", "Latency vs throughput", "CAP theorem", "A 4-step interview framework"], [r("article", "The System Design Primer (GitHub)", null), r("book", "System Design Interview (Alex Xu)", null)], null],
      ["Load balancing and caching", "The two cheapest ways to make a system faster and more reliable.", ["Load balancers (L4/L7)", "CDNs", "Cache strategies and eviction", "Cache invalidation"], [r("video", "ByteByteGo — Caching explained", null)], null],
      ["Databases at scale", "Choose the right store and scale it.", ["SQL vs NoSQL", "Indexing", "Replication", "Sharding and partitioning"], [r("book", "Designing Data-Intensive Applications", null, "Chapters 5–6")], "Design the data model and sharding scheme for a social app."],
      ["Asynchronous processing", "Decouple services with queues and streams.", ["Message queues", "Pub/sub", "Event streaming (Kafka)", "Idempotency and retries"], [r("article", "Kafka introduction", null)], null],
      ["Case study: URL shortener", "Walk through a classic question end to end.", ["Key generation", "Read-heavy scaling", "Analytics", "Rate limiting"], [r("video", "Design a URL shortener", null)], "Write up a full design doc for a URL shortener."],
      ["Case study: chat and news feed", "Real-time delivery and fan-out are favourite interview topics.", ["WebSockets", "Fan-out on write vs read", "Presence", "Ordering and delivery guarantees"], [r("video", "Design WhatsApp / Facebook news feed", null)], null],
      ["Reliability and observability", "Systems fail — design for it and know when it happens.", ["Redundancy and failover", "Rate limiting and backpressure", "Monitoring, logging and tracing", "SLIs and SLOs"], [r("book", "Google SRE Book", null)], null],
      ["Mock interviews", "Practise under time pressure and get feedback.", ["Timed mock interviews", "Communicating trade-offs", "Back-of-the-envelope maths"], [r("practice", "Peer mock interviews", null)], "Do three timed mock interviews and refine your framework after each."],
    ],
  },
];

const SUBJECT_RESOURCES = {
  Physics: [r("course", "Khan Academy — Physics", "https://www.khanacademy.org/science/physics", "Videos + practice"), r("book", "OpenStax College Physics 2e", "https://openstax.org/details/books/college-physics-2e", "Free textbook"), r("practice", "PhET Interactive Simulations", null, "Try it yourself")],
  Chemistry: [r("course", "Khan Academy — Chemistry", "https://www.khanacademy.org/science/chemistry"), r("book", "OpenStax Chemistry 2e", "https://openstax.org/details/books/chemistry-2e", "Free textbook"), r("video", "Crash Course Chemistry", null)],
  Biology: [r("course", "Khan Academy — Biology", "https://www.khanacademy.org/science/biology"), r("book", "OpenStax Biology 2e", "https://openstax.org/details/books/biology-2e", "Free textbook"), r("video", "Amoeba Sisters", null)],
  Mathematics: [r("course", "Khan Academy — Algebra", "https://www.khanacademy.org/math/algebra"), r("video", "3Blue1Brown", "https://www.3blue1brown.com/"), r("practice", "Brilliant — Math", "https://brilliant.org/")],
  "Computer Science": [r("course", "CS50x — Introduction to Computer Science", "https://cs50.harvard.edu/x/"), r("course", "freeCodeCamp", "https://www.freecodecamp.org/learn"), r("practice", "LeetCode", "https://leetcode.com/")],
};

function findTrack(goal, context) {
  const hay = ` ${goal} ${context ?? ""} `.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const t of TRACKS) {
    const score = t.keys.reduce((s, k) => s + (hay.includes(k) ? (k.length > 6 ? 2 : 1) : 0), 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** A track for goals the bank doesn't know, built around the topic bank's concepts. */
function genericTrack(goal) {
  const info = topicInfo(goal);
  const res = SUBJECT_RESOURCES[info.subject] ?? [r("video", `${goal} — crash course`), r("article", `${goal}: a beginner's guide`), r("book", `Introductory textbook on ${goal}`)];
  const cs = info.concepts;
  const stages = [
    ["Orientation and foundations", `Map out ${goal}: what it covers, the key vocabulary, and how you'll study it.`, ["What the field covers", "Core vocabulary", "Setting up a study routine", "Diagnostic self-check"], res.slice(0, 2), null],
    ...cs.map((c, i) => [
      info.subject ? c.term : `${goal} — ${c.term.toLowerCase()}`,
      `${c.definition} Build intuition with examples before moving on.`,
      [c.term, "Worked examples", "Common mistakes", cs[i + 1] ? `Link to ${cs[i + 1].term.toLowerCase()}` : "Mixed practice"],
      [res[i % res.length], r("article", `${c.term} explained`)],
      i % 3 === 2 ? `Explain ${c.term.toLowerCase()} to someone else, then write five practice questions on it.` : null,
    ]),
    ["Capstone and review", `Bring ${goal} together, test yourself under realistic conditions and plan what comes next.`, ["Mixed practice", "Self-test under time pressure", "Reviewing weak spots", "Next steps"], [res[res.length - 1], r("practice", `${goal} practice questions`)], `Create a one-page summary of ${goal} and complete a full self-test.`],
  ];
  return { outcome: `explain and apply the core ideas of ${goal} with confidence`, stages };
}

/** Fit a list of stages to exactly `weeks` milestones (merging or adding practice weeks). */
function fitStages(stages, weeks) {
  const n = stages.length;
  if (n === weeks) return stages;
  if (n > weeks) {
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const group = stages.slice(Math.floor((w * n) / weeks), Math.floor(((w + 1) * n) / weeks));
      if (group.length === 1) {
        out.push(group[0]);
        continue;
      }
      const resources = [];
      for (const g of group) for (const res of g[3]) if (!resources.some((x) => x.title === res.title)) resources.push(res);
      out.push([
        group.length === 2 ? `${group[0][0]} & ${group[1][0]}` : `${group[0][0]} → ${group[group.length - 1][0]}`,
        group.map((g) => g[1]).join(" "),
        group.flatMap((g) => g[2]).slice(0, 6),
        resources.slice(0, 4),
        [...group].reverse().find((g) => g[4])?.[4] ?? null,
      ]);
    }
    return out;
  }
  // Fewer stages than weeks: add practice weeks between them, spread evenly before the final stage.
  const extra = weeks - n;
  const body = stages.slice(0, -1);
  const last = stages[n - 1];
  const out = [];
  let added = 0;
  body.forEach((s, i) => {
    out.push(s);
    const due = Math.round(((i + 1) * extra) / body.length) - added;
    for (let k = 0; k < due; k++) {
      added += 1;
      const kind = added % 3;
      out.push(
        kind === 1
          ? [`Practice sprint: ${s[0]}`, `Consolidate ${soften(s[0])} with mixed, spaced practice before moving on.`, [...s[2].slice(0, 3), "Timed practice set"], [r("practice", `${s[0]} practice problems`)], null]
          : kind === 2
            ? [`Deeper dive: ${s[0]}`, `Go beyond the basics of ${soften(s[0])} with harder examples and edge cases.`, [...s[2].slice(-3), "Challenge problems"], s[3].slice(0, 2), `Write a short explainer on the trickiest part of ${soften(s[0])}.`]
            : ["Review and self-test", "Pause to review everything so far with retrieval practice and fix weak spots.", ["Flashcard review", "Mixed self-test", "Error log review"], [r("practice", "Self-made quiz on weeks so far")], null],
      );
    }
  });
  while (out.length < weeks - 1) out.push(["Review and self-test", "Review everything so far with retrieval practice.", ["Flashcard review", "Mixed self-test", "Error log review"], [r("practice", "Self-made quiz")], null]);
  out.push(last);
  return out;
}

/** Lower-case a title's first letter for use mid-sentence, leaving names and acronyms alone. */
const PROPER = /^(React|JavaScript|TypeScript|Python|Kotlin|Android|Jetpack|Newton|Spanish|NumPy|Kaggle|JEE|Calvin)\b/;
const soften = (t) => (PROPER.test(t) || !/^[A-Z][a-z]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/** Roadmap in the backend roadmapSchema shape: { summary, milestones[] }. */
export function generateRoadmap({ goal, level, weeks, hoursPerWeek, context }) {
  const track = findTrack(goal, context) ?? genericTrack(goal);
  const stages = fitStages(track.stages, weeks);
  const milestones = stages.map(([title, description, topics, resources, project], i) => ({
    week: i + 1,
    title: i === 0 && level !== "beginner" ? `Quick refresher: ${title}` : title,
    description: i === 0 && level !== "beginner" ? `${description} Skim what you already know and spend the time on gaps.` : description,
    topics,
    resources: resources.map((x) => ({ title: x.title, type: x.type, ...(x.url ? { url: x.url } : {}), ...(x.note ? { note: x.note } : {}) })),
    ...(project ? { project: level === "advanced" ? `${project} Stretch goal: extend it beyond the brief.` : project } : {}),
  }));
  const mid = stages.slice(1, -1).map((s) => soften(s[0]));
  const summary = [
    `A ${weeks}-week ${level} path to ${soften(goal.replace(/[.!]+$/, ""))}, sized for about ${hoursPerWeek} hours a week (${weeks * hoursPerWeek} hours in total).`,
    weeks > 1
      ? `You'll start with ${soften(stages[0][0])}${mid.length ? `, work through ${mid.slice(0, 3).join(", ")}${mid.length > 3 ? " and more" : ""}` : ""}, and finish with ${soften(stages[stages.length - 1][0])}.`
      : "",
    `By the end you'll be able to ${track.outcome}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { summary, milestones };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const fail = (path, message) => badRequest(`${path}: ${message}`, [{ path, message }]);

function intField(v, path, min, max, fallback) {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw fail(path, "Invalid input: expected number, received NaN");
  if (!Number.isInteger(n)) throw fail(path, "Invalid input: expected int, received number");
  if (n < min) throw fail(path, `Too small: expected number to be >=${min}`);
  if (n > max) throw fail(path, `Too big: expected number to be <=${max}`);
  return n;
}

function parseGenerate(b = {}) {
  if (typeof b.goal !== "string") throw fail("goal", "Invalid input: expected string");
  const goal = b.goal.trim();
  if (goal.length < 3) throw fail("goal", "What do you want to learn?");
  if (goal.length > 200) throw fail("goal", "Too big: expected string to have <=200 characters");
  const level = b.level === undefined ? "beginner" : b.level;
  if (!LEVELS.includes(level)) throw fail("level", `Invalid option: expected one of ${LEVELS.map((l) => `"${l}"`).join("|")}`);
  let context;
  if (typeof b.context === "string" && b.context.trim()) {
    context = b.context.trim();
    if (context.length > 1000) throw fail("context", "Too big: expected string to have <=1000 characters");
  }
  return { goal, level, weeks: intField(b.weeks, "weeks", 1, 24, 8), hoursPerWeek: intField(b.hoursPerWeek, "hoursPerWeek", 1, 60, 5), context };
}

route("POST", "/roadmaps/generate", async (req) => {
  const input = parseGenerate(req.body);
  await think(1500, 2600);
  const data = generateRoadmap(input);

  const milestones = buildMilestones(data, input.weeks);
  const roadmap = insert("roadmaps", { userId: req.user.id, goal: input.goal, level: input.level, weeks: input.weeks, hoursPerWeek: input.hoursPerWeek, summary: data.summary, milestones });
  return { roadmap };
});

/** Normalise generated milestones exactly like the backend route does. */
export function buildMilestones(data, weeks) {
  return data.milestones.slice(0, weeks).map((m, i) => ({
    id: shortId(),
    week: i + 1,
    title: m.title,
    description: m.description,
    topics: m.topics.slice(0, 8),
    resources: m.resources.slice(0, 5).map((x) => ({
      title: x.title,
      type: x.type,
      url: x.url && TRUSTED.test(x.url) ? x.url : null,
      note: x.note ?? null,
    })),
    project: m.project ?? null,
    done: false,
    completedAt: null,
  }));
}

const withProgress = (rm) => ({
  ...rm,
  progress: rm.milestones.length ? rm.milestones.filter((m) => m.done).length / rm.milestones.length : 0,
});

route("GET", "/roadmaps", (req) => {
  const roadmaps = db.roadmaps.filter((x) => x.userId === req.user.id).sort(by("updatedAt", "desc")).slice(0, 50);
  return { roadmaps: roadmaps.map(withProgress) };
});

function ownRoadmap(id, user) {
  const roadmap = findOr404("roadmaps", id, "Roadmap");
  if (roadmap.userId !== user.id) throw forbidden();
  return roadmap;
}

route("GET", "/roadmaps/:id", (req) => ({ roadmap: withProgress(ownRoadmap(req.params.id, req.user)) }));

route("PATCH", "/roadmaps/:id/milestones/:milestoneId", (req) => {
  const roadmap = ownRoadmap(req.params.id, req.user);
  const done = req.body?.done;
  if (typeof done !== "boolean") throw fail("done", `Invalid input: expected boolean, received ${done === undefined ? "undefined" : typeof done}`);
  const target = roadmap.milestones.find((m) => m.id === req.params.milestoneId);
  if (!target) throw notFound("Milestone");

  const firstCompletion = done && !target.done && !target.completedAt;
  const milestones = roadmap.milestones.map((m) => (m.id === target.id ? { ...m, done, completedAt: done ? (m.completedAt ?? new Date()) : m.completedAt } : m));
  update("roadmaps", roadmap, { milestones });
  const reward = firstCompletion ? awardXp(req.user.id, "roadmap", XP.roadmapMilestone, { tz: req.tz, meta: { roadmapId: roadmap.id } }) : null;
  return { roadmap: withProgress(roadmap), reward };
});

route("DELETE", "/roadmaps/:id", (req) => {
  const roadmap = ownRoadmap(req.params.id, req.user);
  remove("roadmaps", (x) => x.id === roadmap.id);
  return { ok: true };
});
