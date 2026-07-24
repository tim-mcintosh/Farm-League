window.FARM_ORDERS_CONFIG = Object.freeze({
  roundSeconds:120, player:{speed:250,radius:17}, carryingCapacity:4,
  interactionDistance:72, feedbackSeconds:1.5, warningSeconds:5,
  vehicleTransitionSeconds:.8, bestScoreKey:'farmLeague.farmOrders.bestScore',
  products:{
    eggs:{name:'Eggs',icon:'🥚',color:'#f0d9a4'},
    milk:{name:'Milk',icon:'🥛',color:'#b7def0'},
    carrots:{name:'Carrots',icon:'🥕',color:'#ec8b43'},
    corn:{name:'Corn',icon:'🌽',color:'#e7c94c'}
  },
  phases:[
    {until:30,maxTypes:1,minUnits:1,maxUnits:2,deadline:20},
    {until:60,maxTypes:2,minUnits:2,maxUnits:4,deadline:18},
    {until:90,maxTypes:3,minUnits:3,maxUnits:5,deadline:15},
    {until:Infinity,maxTypes:3,minUnits:4,maxUnits:6,deadline:12}
  ],
  scoring:{correctOrder:100,perUnit:10,maxSpeedBonus:50,streakStep:20,maxStreakBonus:100,incompletePenalty:10,incorrectPenalty:25,missedPenalty:50}
});
