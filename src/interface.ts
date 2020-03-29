import { Observable } from 'rxjs';

interface Point {
	x: number,
	y: number
}
  
export interface Ball {
	position: Point,
	direction: Point
}
  
export interface Brick {
	x: number,
	y: number,
	height: number,
	width: number
}

export interface Ticker {
	time: number,
	deltaTime: number
}

export interface State {
	ball: Ball,
	bricks: Brick[],
	score: number
}

export interface Collision {
	paddle: boolean,
	floor: boolean,
	wall: boolean,
	ceiling: boolean,
	brick: boolean
}

export type Ticker$ = Observable<Ticker>
export type Paddle$ = Observable<number>
export type State$ = Observable<State>