const express = require('express');
const router = express.Router();
const transaction = require('../model/utility');
const { isLoggedIn, getUserEmail } = require('../controller/auth');

//// choose random candicate
const randomCandidate = async (initData, page, skipList, column, email) => {
    let responseData;
    const randomList = [];

    // make random number
    while(randomList.length < page){
        let num = Math.floor(Math.random() * initData.length);
        if(randomList.includes(num)) continue;
        randomList.push(num);
    }
    console.log('randomList=',randomList)

    // select random person
    const selectList = [];
    for(let i = 0; i < randomList.length; i++){
        selectList.push(initData[randomList[i]].id);
        skipList.push(initData[randomList[i]].id);
    }
    console.log('selectList=',selectList)
    console.log('new-unSkip=', skipList)

    // update random peson to db
    await updateSkipCandidate(column, skipList, email);

    responseData = await getCandidateInfo(selectList);
    return responseData
}


//// update stp_skip or otp_skip
const updateSkipCandidate = async (column, skipList, email) => {
    const sql = [`UPDATE matching SET ${column} = ? WHERE user = ?`];
    console.log(skipList.toString())
    const skipStr = "[" + skipList.toString() + "]";
    // console.log(typeof(skipStr))
    const value = [skipStr, email];
    await transaction(sql, [value]);
}


//// get user matching info
const getCandidateInfo = async (selectList) => {
    const responseData = [];
    for(let i = 0; i < selectList.length; i++){
        const sql = ["SELECT id, username, image, location, introduction FROM member INNER JOIN profile ON member.email = profile.user WHERE id = ?"];
        const value = [selectList[i]];
        const data = await transaction(sql, [value]);
        responseData.push(data[0][0]);
    }
    return responseData
}


//// check if the column un_match is not NULL
const checkPandingMatch = async (selectData) => {
    const selectDataList = JSON.parse(selectData[0][0]['un_match'])
    console.log('selectDataList=', selectDataList)
    const responseData = await getCandidateInfo(selectDataList)
    return responseData
}


//// find candicate in opposite type
const optController = async (email, sexOption, type) => {
    let responseData;

    const sql = ["SELECT id FROM member INNER JOIN profile ON member.email = profile.user WHERE userstatus = 1 AND sex = ? AND type NOt IN (?)"];
    const value = [sexOption, type]
    const initData = await transaction(sql, [value]);
    const skip = await transaction(["SELECT otp_skip FROM matching WHERE user = ?"], [[email]]);

    if(skip[0][0]['otp_skip'] === null){
        console.log('first time otp')
        const skipList = [];
        if(initData[0].length < 20){
            responseData = await randomCandidate(initData[0], initData[0].length, skipList, 'otp_skip', email)
        }else{
            responseData = await randomCandidate(initData[0], 10, skipList, 'otp_skip', email)
        }
    }else{
        const skipList = JSON.parse(skip[0][0]['otp_skip']);

        let newArr = initData[0]
        for(let i = 0; i < skipList.length; i++){
            newArr = newArr.filter((item) => item.id !== skipList[i])
        }

        if(newArr.length === 0){
            console.log('no opt data');
            responseData = null;
            return responseData
        }

        if(newArr.length < 20){
            responseData = await randomCandidate(newArr, newArr.length, skipList, 'otp_skip', email)
            return responseData
        }

        responseData = await randomCandidate(newArr, 10, skipList, 'otp_skip', email)
    }
    return responseData
} 


router.get('/', async (req, res) => {
    const email = getUserEmail(req);
    const selectData = await transaction(["SELECT un_match FROM matching WHERE user = ?"], [[email]]);
    if(selectData[0][0]['un_match']){
        let responseData = await checkPandingMatch(selectData);
        return res.status(200).json({"data": responseData})
    };
    return res.status(200).json({"data": null})
})


router.post('/', isLoggedIn, async (req, res) => {
    const email = getUserEmail(req);
    const typeData = await transaction(["SELECT type, sex FROM profile WHERE user = ?"], [email]);
    const {type, sex} = typeData[0][0];

    if(sex === 'Male'){
        sexOption = 'Female';
    }else if(sex === 'Female'){
        sexOption = 'Male';
    }else{
        sexOption = 'Bisexual';
    }

    let responseData;

    const sql = ["SELECT id FROM member INNER JOIN profile ON member.email = profile.user WHERE userstatus = 1 AND sex = ? AND type = ?"];
    const value = [sexOption, type]
    const initData = await transaction(sql, [value]);
    const skip = await transaction(["SELECT stp_skip FROM matching WHERE user = ?"], [[email]])
    console.log('init-data=',initData[0])
    console.log('init-skip=',skip)

    if(skip[0][0]['stp_skip'] === null){
        console.log('first time')
        const skipList = [];
        if(initData[0].length < 20){
            responseData = await randomCandidate(initData[0], initData[0].length, skipList, 'stp_skip', email);
        }else{
            responseData = await randomCandidate(initData[0], 10, skipList, 'stp_skip', email)
        }
    }else{
        console.log(skip)
        console.log('skip=',skip[0][0]['stp_skip'])
        const skipList = JSON.parse(skip[0][0]['stp_skip']);

        let newArr = initData[0]
        for(let i = 0; i < skipList.length; i++){
            newArr = newArr.filter((item) => item.id !== skipList[i])
        }
        console.log('newArr=',newArr)

        /// HERE!!!!
        if(newArr.length === 0){
            console.log('no data');
            responseData = await optController(email, sexOption, type);
            return res.status(200).json({"type":type, "data": responseData})
        }

        if(newArr.length < 20){
            console.log('Hello');
            responseData = await randomCandidate(newArr, newArr.length, skipList, 'stp_skip', email);
            return res.status(200).json({"type":type, "data": responseData})
        }

        responseData = await randomCandidate(newArr, 10, skipList, 'stp_skip', email)
    }
    console.log('responseData=', responseData)
    res.status(200).json({"type":type, "data": responseData})
});


router.patch('/update', async (req, res) => {
    const {data} = req.body;
    const selectList = [];
    data.map((item) => {selectList.push(item.id)});
    const selectStr = "[" + selectList.toString() + "]";
    const email = getUserEmail(req);
    const sql = ["UPDATE matching SET un_match = ? WHERE user = ?"];
    const value = [selectStr, email];
    await transaction(sql, [value]);
    res.status(200).json({"success": true})
})


router.delete('/refresh', async (req, res) => {
    const email = getUserEmail(req);
    await transaction(["UPDATE matching SET stp_skip = NULL, otp_skip = NULL, un_match = NULL WHERE user = ?"], [email]);
    res.status(200).json({"success": true})
})

module.exports = router;