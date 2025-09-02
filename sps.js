let userScore = 0;
let computerScore = 0;

const choices = document.querySelectorAll(".choice");
const msg = document.querySelector("#msg");
const userScorePara = document.querySelector("#user-score");
const computerScorePara = document.querySelector("#computer-score");
const genCompChoice = () => {
    const options = ["rock","paper","scissor"];
    const randIdx = Math.floor(Math.random() * 3);
    return options[randIdx];
};
const drawGame = () => {
    
    msg.innerText="Draw";
    msg.style.backgroundColor="yellow";
};
const showWinner = (userWin,userChoice,compChoice) => {
    if (userWin) {
        userScore++;
        userScorePara.innerText = userScore;
        msg.innerText=`Hurray !! You did it .. You are the Winner${userChoice} beats ${compChoice}`;
        msg.style.backgroundColor = "red";
    }else{
        computerScore++;
        computerScorePara.innerText=computerScore;
        msg.innerText=`Oops...Try again ${compChoice} beats ${userChoice}`;
        msg.style.backgroundColor="green";
    }
};
const playGame = (userChoice) => {
    
    //generate  computer choice ->modular
    const compChoice = genCompChoice();

    if(userChoice == compChoice){
        //Draw Game
        drawGame();
    }else {
        let userWin = true ;
        if (userChoice === "rock"){
            //scissors , paper
            userWin = compChoice === "paper" ? false : true;
        }else if (userChoice === "paper"){
            //rock,scissor
            userWin = compChoice === "scissor" ? false : true;
        }else {
            //rock,paper
            userWin = compChoice === "rock" ? false : true;
        }
        showWinner(userWin,userChoice,compChoice);
    }
};
choices.forEach((choice) =>{
  
  choice.addEventListener("click",() => {
    const userChoice = choice.getAttribute("id");
   playGame(userChoice);
   });
});