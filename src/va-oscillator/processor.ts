export const PROCESSOR = `(()=>{function x(t){return Object.keys(t).map(e=>{let{min:r,max:o,init:n}=t[e];return{name:e,minValue:r,maxValue:o,defaultValue:n,automationRate:"k-rate"}})}var u=Math.PI,C=2*u,y=u*u;var T=4/u,q=-4/y;var s=5/12,c=Math.pow(10,-1/s),v=1/(1-c),D=1/(1+s*Math.log10(1+c)),R=1/(1+-Math.pow(10,-1/s)),O=s*Math.log10(1+c),_=1/(-s*Math.log10(c)+O);function m(t,e,r){return Math.max(e,Math.min(r,t))}function P(t){return 2*t-1}function M(t,e){return(e+t%e)%e}function k(t,e,r){return e+M(t-e,r-e)}var f=class{constructor(e){this.sampleRate=e;this.mcounter=0;this.phaseInc=0;this.phaseOffset=0;this.freqOffset=0;this.freqHz=0;this.mcounter=0,this.phaseOffset=0,this.freqOffset=0}setFrequency(e){this.freqHz=e,this.phaseInc=this.freqHz/this.sampleRate}addPhaseOffset(e,r){this.phaseOffset=e,this.phaseInc>0?this.mcounter+=e:this.mcounter-=e,r&&this.wrapClock()}removePhaseOffset(){this.phaseInc>0?this.mcounter+=-this.phaseOffset:this.mcounter-=-this.phaseOffset}advanceClock(e){this.mcounter+=e*this.phaseInc}wrapClock(){if(this.mcounter>=0&&this.mcounter<=1)return!1;let e=this.mcounter<0;return!e&&this.mcounter<2?this.mcounter-=1:e&&this.mcounter>-1?this.mcounter+=1:this.mcounter=k(this.mcounter,0,1),!0}};var a={waveform:1,frequency:440,pulseWidth:.5,mix:.5},S={waveform:{min:0,max:8,init:a.waveform},frequency:{min:0,max:1e4,init:a.frequency},mix:{min:0,max:1,init:a.mix},pulseWidth:{min:0,max:1,init:a.pulseWidth}},l=class{constructor(e){this.sampleRate=e;this.params={...a};this.triLast=0;this.triCurrent=0;this.noiseValue=19.19191919191919;this.oscClock=new f(e),this.params.waveform===7&&(this.oscClock.mcounter=.5)}setParams(e,r,o,n){this.params.waveform=m(Math.floor(e),0,3),this.oscClock.setFrequency(r),this.params.pulseWidth=m(o,0,1),this.params.mix=m(n,0,1)}renderAudio(e){if(e.length!==0)for(let r=0;r<e[0].length;r++){let o=this.render();this.oscClock.advanceClock(1),this.oscClock.wrapClock();for(let n=0;n<e.length;n++)e[n][r]=o}}render(){let{params:e}=this,{mcounter:r,phaseInc:o}=this.oscClock;if(e.waveform===0)return Math.sin(this.oscClock.mcounter*C);if(e.waveform===1)return this.triLast=this.triCurrent,this.triCurrent=o*p(r,o,.5)+(1-o)*this.triLast,this.triCurrent*5;if(e.waveform===2)return 1-2*r+d(r,o);if(e.waveform===3)return p(r,o,.5);if(e.waveform===4)return p(r,o,.75);if(e.waveform===5)return this.noiseValue+=19,this.noiseValue*=this.noiseValue,this.noiseValue-=Math.floor(this.noiseValue),this.noiseValue-.5;let n=w(this.oscClock);e.waveform,this.oscClock.addPhaseOffset(e.pulseWidth,!0);let i=w(this.oscClock),A=e.pulseWidth<.5?1/(1-e.pulseWidth):1/e.pulseWidth,b=(.5*n-.5*i)*A;if(this.oscClock.removePhaseOffset(),e.waveform===6)return b;if(e.waveform===8)return n*(1-e.mix)+b*e.mix;throw new Error("Invalid waveform")}};function w(t){let e=P(t.mcounter),r=0,o=1;return r=N(t.mcounter,Math.abs(t.phaseInc),o,!0),e+=r,e}function N(t,e,r,o){let n=0;if(t>1-e){let i=(t-1)/e;n=r*(i*i+2*i+1)}else if(t<e){let i=t/e;n=r*(2*i-i*i-1)}return o||(n*=-1),n}function d(t,e){return t<e?(t/=e,t+t-t*t-1):t>1-e?(t=(t-1)/e,t*t+t+t+1):0}function p(t,e,r){let o=t<r?1:-1;return o+=d(t,e),o-=d((t+(1-r))%1,e),o}var g=x(S),h=class extends AudioWorkletProcessor{constructor(){super();this.oscillator=new l(sampleRate)}process(r,o,n){this.oscillator.setParams(n.waveform[0],n.frequency[0],n.pulseWidth[0],n.mix[0]);let i=o[0];return this.oscillator.renderAudio(i),!0}static get parameterDescriptors(){return g}};registerProcessor("VaOscillatorWorklet",h);})();`;
