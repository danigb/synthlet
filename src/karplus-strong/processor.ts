export const PROCESSOR = `(()=>{function D(i){return Object.keys(i).map(e=>{let{min:t,max:s,defaultValue:r}=i[e];return{name:e,minValue:t,maxValue:s,defaultValue:r,automationRate:"k-rate"}})}function C(i,e,t){let s=t(),r=t(),a=Math.sqrt(-2*Math.log(s))*Math.cos(2*Math.PI*r);return i+e*a}var f=class{constructor(){this.defaultGeneratorEngine=Math.random;this.pinkNoiseBuffer=[0,0];this.bN=[.99765,-.96362,.46454];this.g_fScale=2/4294967295;this.g_x1=1732584193;this.g_x2=4023233417}doGaussianWhiteNoise(e=0,t=1){return C(e,t,this.defaultGeneratorEngine)}doWhiteNoise(){this.g_x1^=this.g_x2;let e=this.g_x2*this.g_fScale;return this.g_x2+=this.g_x1,e}doPinkNoise(){let e=this.doWhiteNoise();return this.doPinkingFilter(e)}doPinkingFilter(e){return this.bN[0]=.99765*this.bN[0]+e*.099046,this.bN[1]=.963*this.bN[1]+e*.2965164,this.bN[2]=.57*this.bN[2]+e*1.0526913,this.bN[0]+this.bN[1]+this.bN[2]+e*.1848}};var m=class{constructor(){this.coeffs_a0=0;this.coeffs_a1=0;this.coeffs_a2=0;this.coeffs_b1=0;this.coeffs_b2=0;this.state_xz1=0;this.state_xz2=0;this.fc=1;this.sampleRate=1}reset(e){this.sampleRate=e;let t=2*Math.PI*this.fc/this.sampleRate,s=Math.cos(t)/(1+Math.sin(t));this.coeffs_a0=(1+s)/2,this.coeffs_a1=-(1+s)/2,this.coeffs_a2=0,this.coeffs_b1=-s,this.coeffs_b2=0}processAudioSample(e){let t=this.coeffs_a0*e+this.state_xz1;return this.state_xz1=this.coeffs_a1*e-this.coeffs_b1*t+this.state_xz2,this.state_xz2=this.coeffs_a2*e-this.coeffs_b2*t,t}};var p=class{constructor(){this.counter=0;this.targetValueInSamples=0}resetTimer(){this.counter=0}setExpireSamples(e){this.targetValueInSamples=e}setExpireMilliSec(e,t){this.setExpireSamples(Math.floor(t*(e/1e3)))}getExpireSamples(){return this.targetValueInSamples}timerExpired(){return this.counter>=this.targetValueInSamples}advanceTimer(e=1){this.counter+=e}getTick(){return this.counter}};var b=class{constructor(){this.attackTime_mSec=-1;this.releaseTime_mSec=-1;this.holdTime_mSec=-1;this.attackCoeff=0;this.attackOffset=0;this.attackTCO=0;this.releaseCoeff=0;this.releaseOffset=0;this.releaseTCO=0;this.sampleRate=0;this.envelopeOutput=0;this.state=0;this.holdTimer=new p;this.noteOn=!1}reset(e){return this.sampleRate=e,this.holdTimer.resetTimer(),this.attackTCO=Math.exp(-1.5),this.releaseTCO=Math.exp(-4.95),this.calcAttackCoeff(this.attackTime_mSec),this.calcReleaseCoeff(this.releaseTime_mSec),this.envelopeOutput=0,this.state=0,!0}render(){switch(this.state){case 0:{this.envelopeOutput=0;break}case 1:{if(this.envelopeOutput=this.attackOffset+this.envelopeOutput*this.attackCoeff,this.envelopeOutput>=1||this.attackTime_mSec<=0){this.envelopeOutput=1,this.holdTime_mSec>0?this.state=2:this.state=3;break}break}case 2:{this.envelopeOutput=1,this.holdTimer.advanceTimer(),this.holdTimer.timerExpired()&&(this.state=3);break}case 3:{if(this.envelopeOutput=this.releaseOffset+this.envelopeOutput*this.releaseCoeff,this.envelopeOutput<=0||this.releaseTime_mSec<=0){this.envelopeOutput=0,this.state=0;break}break}}return this.envelopeOutput}startEG(){return this.envelopeOutput=0,this.state=1,this.holdTimer.resetTimer(),!0}setParameters(e,t,s){this.attackTime_mSec!=e&&this.calcAttackCoeff(e),this.releaseTime_mSec!=s&&this.calcReleaseCoeff(s),this.holdTime_mSec!=t&&(this.holdTimer.setExpireMilliSec(t,sampleRate),this.holdTime_mSec=t)}calcAttackCoeff(e,t=1){this.attackTime_mSec=e;let s=this.sampleRate*(this.attackTime_mSec*t/1e3);this.attackCoeff=Math.exp(-Math.log((1+this.attackTCO)/this.attackTCO)/s),this.attackOffset=(1+this.attackTCO)*(1-this.attackCoeff)}calcReleaseCoeff(e,t=1){this.releaseTime_mSec=e;let s=this.sampleRate*(this.releaseTime_mSec*t/1e3);this.releaseCoeff=Math.exp(-Math.log((1+this.releaseTCO)/this.releaseTCO)/s),this.releaseOffset=-this.releaseTCO*(1-this.releaseCoeff)}};var d=class{constructor(){this.noiseGen=new f;this.noiseEG=new b;this.dcFilter=new m}reset(e){return this.noiseEG.reset(e),this.dcFilter.reset(e),!0}render(e=0){let t=this.noiseGen.doWhiteNoise(),s=this.noiseEG.render(),r=t*s+e;return this.dcFilter.processAudioSample(r)}startExciter(){this.noiseEG.startEG()}setParameters(e,t,s){this.noiseEG.setParameters(e,t,s)}};var _=class{constructor(){this.coeffs_a0=0;this.coeffs_a1=0;this.coeffs_a2=0;this.coeffs_b1=0;this.coeffs_b2=0;this.coeffs_c0=0;this.coeffs_d0=0;this.state_xz1=0;this.state_xz2=0;this.sampleRate=1}reset(e){this.sampleRate=e,this.state_xz1=0,this.state_xz2=0}setParameters(e,t){let s=2*Math.PI*e/this.sampleRate,r=Math.pow(10,t/20),o=(1+r)/4*Math.tan(s/2),n=(1-o)/(1+o);this.coeffs_a0=(1+n)/2,this.coeffs_a1=-this.coeffs_a0,this.coeffs_a2=0,this.coeffs_b1=-n,this.coeffs_b2=0,this.coeffs_c0=r-1,this.coeffs_d0=1}processAudioSample(e){let t=this.coeffs_a0*e+this.state_xz1;return this.state_xz1=this.coeffs_a1*e-this.coeffs_b1*t+this.state_xz2,this.state_xz2=this.coeffs_a2*e-this.coeffs_b2*t,e*this.coeffs_d0+t*this.coeffs_c0}};var h=class{constructor(){this.coeffs_a0=0;this.coeffs_a1=0;this.coeffs_a2=0;this.coeffs_b1=0;this.coeffs_b2=0;this.state_xz1=0;this.state_xz2=0;this.fc=5;this.Q=.5;this.sampleRate=1}reset(e){this.sampleRate=e,this.clear()}clear(){this.state_xz1=0,this.state_xz2=0}setParameters(e,t){if(this.fc===e&&this.Q===t)return;this.fc=e,this.Q=t;let s=2*Math.PI*e/this.sampleRate,r=1/t,a=1-r/2*Math.sin(s),o=1+r/2*Math.sin(s),n=.5*(a/o),u=(.5+n)*Math.cos(s),c=(.5+n-u)/2;this.coeffs_a0=c,this.coeffs_a1=2*c,this.coeffs_a2=c,this.coeffs_b1=-2*u,this.coeffs_b2=2*n}processAudioSample(e){let t=this.coeffs_a0*e+this.state_xz1;return this.state_xz1=this.coeffs_a1*e-this.coeffs_b1*t+this.state_xz2,this.state_xz2=this.coeffs_a2*e-this.coeffs_b2*t,t}};var k=class{constructor(){this.fc=0;this.Q=0;this.boostCut_dB=0;this.sampleRate=1;this.coeffs_a0=0;this.coeffs_a1=0;this.coeffs_a2=0;this.coeffs_b1=0;this.coeffs_b2=0;this.coeffs_c0=0;this.coeffs_d0=0;this.state_xz1=0;this.state_xz2=0}reset(e){this.sampleRate=e}setParameters(e,t,s){if(this.fc==e&&this.Q==t&&this.boostCut_dB==s)return;this.fc=e,this.Q=t,this.boostCut_dB=s;let r=2*Math.PI,a=Math.PI,o=r*e/this.sampleRate,n=Math.pow(10,s/20),u=o/(2*t);u>=.95*a/2&&(u=.95*a/2);let c=4/(1+n),N=1-c*Math.tan(u),z=1+c*Math.tan(u),M=.5*(N/z),B=(.5+M)*Math.cos(o),w=.5-M;this.coeffs_a0=w,this.coeffs_a1=0,this.coeffs_a2=-w,this.coeffs_b1=-2*B,this.coeffs_b2=2*M,this.coeffs_c0=n-1,this.coeffs_d0=1}processAudioSample(e){let t=this.coeffs_a0*e+this.state_xz1;return this.state_xz1=this.coeffs_a1*e-this.coeffs_b1*t+this.state_xz2,this.state_xz2=this.coeffs_a2*e-this.coeffs_b2*t,e*this.coeffs_d0+t*this.coeffs_c0}};var R=(i,e,t)=>t*e+(1-t)*i,v=class{constructor(){this.writeIndex=0;this.bufferLength=1024;this.wrapMask=1023;this.interpolate=!0;this.interpolator=R}flushBuffer(){this.buffer&&this.buffer.fill(0,0,this.bufferLength)}createCircularBuffer(e){let t=Math.pow(2,Math.ceil(Math.log(e)/Math.log(2)));this.createCircularBufferPowerOfTwo(t)}createCircularBufferPowerOfTwo(e){this.writeIndex=0,this.bufferLength=e,this.wrapMask=e-1,this.buffer=new Array(e),this.flushBuffer()}writeBuffer(e){this.buffer&&(this.buffer[this.writeIndex++]=e,this.writeIndex&=this.wrapMask)}readBuffer(e){if(!this.buffer)throw new Error("Circular buffer not created");let t=(this.writeIndex-1-e&this.wrapMask)>>>0;return this.buffer[t]}readBufferWithFractionalDelay(e){if(!this.buffer)throw new Error("Circular buffer not created");let t=Math.floor(e),s=this.readBuffer(t);if(!this.interpolate)return s;let r=(t+1&this.wrapMask)>>>0,a=this.readBuffer(r),o=e-t;return this.interpolator(s,a,o)}setInterpolate(e){this.interpolate=e}};var l=class{constructor(){this.delaySamples=0;this.delayBuffer=new v}clear(){this.delayBuffer.flushBuffer()}reset(e,t=8.176){this.delayBuffer.createCircularBuffer(Math.floor(e/t)),this.clear()}setDelayInSamples(e){this.delaySamples=e}writeDelay(e){this.delayBuffer.writeBuffer(e)}readDelay(){return this.delayBuffer.readBuffer(this.delaySamples)}};var P=class{constructor(){this.coeffs_a0=0;this.coeffs_a1=0;this.coeffs_a2=0;this.coeffs_b1=0;this.coeffs_b2=0;this.state_xz1=0;this.state_xz2=0;this.fc=5;this.sampleRate=1}reset(e){this.clear(),this.sampleRate=e}clear(){this.state_xz1=0,this.state_xz2=0}setParameters(e){if(this.fc==e)return;this.fc=e;let t=2*Math.PI*this.fc/this.sampleRate,s=2-Math.cos(t),r=Math.pow(s*s-1,.5)-s,a=1+r;this.coeffs_a0=a,this.coeffs_a1=0,this.coeffs_a2=0,this.coeffs_b1=r,this.coeffs_b2=0}processAudioSample(e){let t=this.coeffs_a0*e+this.state_xz1;return this.state_xz1=this.coeffs_a1*e-this.coeffs_b1*t+this.state_xz2,this.state_xz2=this.coeffs_a2*e-this.coeffs_b2*t,t}};var x=class{constructor(){this.combDelay=new l;this.bridgeIntegrator=new P;this.pickupFilter=new h}clear(){this.combDelay.clear(),this.bridgeIntegrator.clear()}reset(e,t=8.176){this.combDelay.reset(e,t),this.combDelay.clear(),this.pickupFilter.reset(e),this.pickupFilter.setParameters(2500,1.5),this.bridgeIntegrator.reset(e),this.bridgeIntegrator.setParameters(20)}setDelayInSamples(e){this.combDelay.setDelayInSamples(e-1)}processAudioSample(e,t){if(t==4)return 12*this.bridgeIntegrator.processAudioSample(e);if(t==2)return this.pickupFilter.processAudioSample(e);let s=this.combDelay.readDelay();this.combDelay.writeDelay(e);let r=.5*(e-s);if(t==0)return r;if(t==3)return this.pickupFilter.processAudioSample(r);if(t==1)return 12*this.bridgeIntegrator.processAudioSample(r);if(t==5){let a=2*this.pickupFilter.processAudioSample(r);return 12*this.bridgeIntegrator.processAudioSample(a)}return e}};var y=class{constructor(){this.alpha=0;this.state_0=0;this.state_1=0}reset(){this.state_0=0,this.state_1=0}setAlpha(e){this.alpha=e}processAudioSample(e){let t=e*this.alpha+this.state_0-this.alpha*this.state_1;return this.state_0=e,this.state_1=t,t}};var g=class{constructor(){this.state=[0,0];this.state_0=0}reset(){this.state_0=0}processAudioSample(e){let t=.5*e+.5*this.state_0;return this.state_0=e,t}};var S=class{constructor(){this.sampleRate=1;this.decay=0;this.delayLine=new l;this.fracDelayAPF=new y;this.loopFilter=new g}reset(e){return this.sampleRate=e,this.delayLine.reset(e,8.176),this.loopFilter.reset(),this.fracDelayAPF.reset(),!0}process(e){let t=this.delayLine.readDelay(),s=this.loopFilter.processAudioSample(e+t),r=this.fracDelayAPF.processAudioSample(s);return this.delayLine.writeDelay(r*this.decay),r}setParameters(e,t){this.decay=t;let s=this.sampleRate/e,r=s-.5,a=Math.floor(r),o=s-(a+.5),u=2*Math.PI*e/this.sampleRate/2,c=Math.sin((1-o)*u)/Math.sin((1+o)*u);return this.delayLine.setDelayInSamples(a-1),this.fracDelayAPF.setAlpha(c),s}flushDelays(){this.delayLine.clear(),this.loopFilter.reset(),this.fracDelayAPF.reset()}};var T={gate:{min:0,max:1,defaultValue:0},frequency:{min:0,max:1e4,defaultValue:1}};function I(i,e){return e===0?i:Math.tanh(e*i)/Math.tanh(e)}function O(i,e,t){return(t-e)*i+e}var A=class{constructor(){this.midiPitch=0;this.outputAmplitude=1;this.pluckPosition=1;this.exciter=new d;this.resonator=new S;this.highShelfFilter=new _;this.bassFilter=new h;this.distortionFilter=new h;this.pluckPosFilter=new x;this.bodyFilter=new k;this.mode=0;this.prevGate=0}setParams(e,t){e===1&&this.prevGate!==1&&this.doNoteOn(t),this.prevGate=e}reset(e){this.resonator.reset(e),this.exciter.reset(e),this.pluckPosFilter.reset(e),this.highShelfFilter.reset(e),this.bodyFilter.reset(e),this.bassFilter.reset(e),this.bassFilter.setParameters(150,.707),this.distortionFilter.reset(e),this.distortionFilter.setParameters(2e3,2.5),this.updateParameters({mode:0,decay:.5,detune:0,boost:0,bite:0,pluckPos:.5,attackTime_mSec:5,holdTime_mSec:200,releaseTime_mSec:500})}doNoteOn(e){return this.midiPitch=e,this.resonator.flushDelays(),this.pluckPosFilter.clear(),this.highShelfFilter.reset(sampleRate),this.bassFilter.reset(sampleRate),this.bodyFilter.reset(sampleRate),this.exciter.startExciter(),!0}doNoteOff(){return!0}process(){let e=this.exciter.render();e=this.highShelfFilter.processAudioSample(e),this.mode===0?e=this.pluckPosFilter.processAudioSample(e,1):this.mode===1?e=this.pluckPosFilter.processAudioSample(e,3):this.mode===2?e=this.pluckPosFilter.processAudioSample(e,5):this.mode===3&&(e=0);let t=this.resonator.process(e);return this.mode===1&&(t=I(t*10,5e3),t=.5*this.distortionFilter.processAudioSample(t),t*=this.outputAmplitude),t}updateParameters(e){let t=O(e.detune,-12,12),s=440*Math.pow(2,(this.midiPitch-69+t)/12),r=this.resonator.setParameters(s,e.decay);this.pluckPosition=O(e.pluckPos,10,2),this.pluckPosFilter.setDelayInSamples(r/this.pluckPosition),this.exciter.setParameters(e.attackTime_mSec,e.holdTime_mSec,e.releaseTime_mSec);let a=O(e.bite,0,20);this.highShelfFilter.setParameters(2e3,a);let o=3;e.mode==0?this.bodyFilter.setParameters(400,1,o):e.mode==1?this.bodyFilter.setParameters(300,2,o):e.mode==2&&this.bodyFilter.setParameters(250,1,o);let n=O(e.boost,0,20);return this.outputAmplitude=Math.pow(10,n/20),!0}};var G=D(T),F=class extends AudioWorkletProcessor{constructor(){super();this.osc=new A,this.osc.reset(sampleRate)}process(t,s,r){let a=r.gate[0],o=r.frequency[0];this.osc.setParams(a,o);let n=s[0];for(let u=0;u<n.length;u++)for(let c=0;c<n[u].length;c++)n[u][c]=this.osc.process();return!0}static get parameterDescriptors(){return G}};registerProcessor("KarplusStrongOscillatorWorklet",F);})();`;