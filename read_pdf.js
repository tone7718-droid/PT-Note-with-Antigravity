const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('물리치료 환자 평가지.pdf');

pdf(dataBuffer).then(function(data) {
    console.log(data.text);
}).catch(err => console.error(err));
