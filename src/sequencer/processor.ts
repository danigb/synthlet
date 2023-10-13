export const PROCESSOR = `(()=>{function c(a){return Object.keys(a).map(t=>{let{min:e,max:n,init:r}=a[t];return{name:t,minValue:e,maxValue:n,defaultValue:r,automationRate:"k-rate"}})}var s=class{constructor(t,e=440){this.sampleRate=t;this.inc=e/this.sampleRate,this.phase=0}freq(t){this.inc=t/this.sampleRate}tick(t=1){for(this.phase+=t*this.inc;this.phase>=1;)this.phase-=1;for(;this.phase<=-1;)this.phase+=1;return this.phase}};var m={bpm:{min:0,max:300,init:100}};function d(a){let t=100,e={events:[{time:0,value:1}],duration:1},n=new s(a,t/60),r=0,p=0;function l(o){t=o.bpm[0],n.freq(o.bpm[0]/60*e.duration)}function f(o){e=o,r=r%e.duration,n.freq(t/(60*e.duration))}function h(o){if(!e.duration)return;let i=n.tick(o.length)*e.duration;i<=p&&(r=0),!(r>=e.events.length)&&(i>e.events[r].time&&(o[0]=e.events[r].value,r=r+1),p=i)}return{setParams:l,setSequence:f,fillControl:h}}var P=c(m),u=class extends AudioWorkletProcessor{constructor(){super();this.d=!1,this.p=d(sampleRate),this.port.onmessage=e=>{switch(e.data.type){case"SET_SEQUENCE":this.p.setSequence(e.data.sequence);return;case"DISCONNECT":this.d=!0;return}}}process(e,n,r){return this.d?!1:(this.p.setParams(r),this.p.fillControl(n[0][0]),!0)}static get parameterDescriptors(){return P}};registerProcessor("SequencerWorklet",u);})();`;
