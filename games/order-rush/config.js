window.ORDER_RUSH_CONFIG = Object.freeze({
  gameVersion:'1.1.0',roundSeconds:120,maximumLegitimateScore:8000,
  roundSummaryKey:'farmLeague.orderRush.lastRound.v1',
  player:{speed:255,radius:17}, feedbackSeconds:1.4, warningSeconds:5,
  vehicleTransitionSeconds:.8, foodVisible:7, foodRadius:18,
  conveyor:{speed:61,itemSpacing:68},
  orderFoodChance:.75, boxCount:2, bestScoreKey:'farmLeague.orderRush.bestScore.v2',
  products:{
    eggs:{name:'Eggs',icon:'🥚',color:'#f0d9a4'},
    milk:{name:'Milk',icon:'🥛',color:'#b7def0'},
    carrots:{name:'Carrots',icon:'🥕',color:'#ec8b43'},
    corn:{name:'Corn',icon:'🌽',color:'#e7c94c'}
  },
  phases:[
    {until:30,maxTypes:1,minUnits:1,maxUnits:2,deadline:28},
    {until:60,maxTypes:2,minUnits:2,maxUnits:3,deadline:25},
    {until:90,maxTypes:2,minUnits:2,maxUnits:4,deadline:22},
    {until:Infinity,maxTypes:3,minUnits:3,maxUnits:4,deadline:19}
  ],
  scoring:{correctOrder:25,perUnit:2,maxSpeedBonus:10,streakStep:2,maxStreakBonus:10,missedPenalty:0}
});
