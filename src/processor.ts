const CODE = `
(()=>{var a=class{constructor(){this.value=0,this.a=.1,this.d=.1,this.s=.5,this.r=.5,this.stage=3}start(){this.stage=0}release(){this.stage=2}process(t){switch(this.stage){case 0:this.value+=(1.1-this.value)*this.a*t,this.value>=1&&(this.value=1,this.stage=1);break;case 1:this.value+=(this.s-this.value)*this.d*t;break;case 2:this.value+=(-.1-this.value)*this.r*t,this.value<=0&&(this.value=0,this.stage=3);break}return this.value}};var i=class{#t;#e;constructor(){this.#t=0,this.#e=0}process(t,e){let r=e*t;for(this.#t+=r;this.#t>1;)this.#t-=1;switch(this.#e){case 0:return Math.sin(this.#t*2*Math.PI)}}};var p=s=>440*Math.pow(2,(s-69)/12),n=class{#t;#e;#s;constructor(){this.#t=new i,this.#s=new a,this.note=60}set note(t){this.#e=t,this.targetFrequency=p(t)}get note(){return this.#e}start(){this.#s.start()}release(){this.#s.release()}process(t){let e=this.#s.process(t);return e===0?0:this.#t.process(t,this.targetFrequency)*e}};var u=class extends AudioWorkletProcessor{constructor(){super();this.voice=new n,this.dt=1/sampleRate}process(e,r,c){let h=c.trigger[0];h===1?this.voice.start():h===0&&this.voice.release();let m=c.note[0];this.voice.note=m;let l=r[0][0];for(let o=0;o<l.length;o++)l[o]=this.voice.process(this.dt);return!0}static get parameterDescriptors(){return[{name:"trigger",defaultValue:0,minValue:0,maxValue:1,automationRate:"k-rate"},{name:"note",defaultValue:60,minValue:0,maxValue:127,automationRate:"k-rate"}]}static get parameterDescriptorsOther(){return[["bandwidth",.9999,0,1,"k-rate"],["inputDiffusion1",.75,0,1,"k-rate"],["inputDiffusion2",.625,0,1,"k-rate"],["decay",.5,0,1,"k-rate"],["decayDiffusion1",.7,0,.999999,"k-rate"],["decayDiffusion2",.5,0,.999999,"k-rate"],["damping",.005,0,1,"k-rate"],["excursionRate",.5,0,2,"k-rate"],["excursionDepth",.7,0,2,"k-rate"],["wet",1,0,1,"k-rate"],["dry",0,0,1,"k-rate"]].map(e=>new Object({name:e[0],defaultValue:e[1],minValue:e[2],maxValue:e[3],automationRate:e[4]}))}};registerProcessor("synthlet-worklet",u);})();
`;
export const PROCESSOR = `"use strict";${CODE}`;
