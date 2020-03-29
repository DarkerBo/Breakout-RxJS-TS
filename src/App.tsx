import React, { useRef, useEffect } from 'react';
import { 
  interval, 
  animationFrameScheduler, 
  fromEvent, 
  merge, 
  Observable, 
  Subject,  
} from 'rxjs';
import { 
  map, 
  scan, 
  mapTo, 
  distinctUntilChanged, 
  withLatestFrom, 
  filter, 
  retryWhen, 
  delay 
} from 'rxjs/operators';
import { 
  BRICK_GAP, 
  PADDLE_WIDTH, 
  PADDLE_HEIGHT, 
  BALL_RADIUS, 
  TICKER_INTERVAL, 
  PADDLE_SPEED, 
  ARROW_LEFT,
  ARROW_RIGHT,
  BRICK_COLUMNS,
  BRICK_ROWS,
  BRICK_HEIGHT,
  BALL_SPEED,
} from './common';
import { Ball, Brick, Ticker$, Paddle$, State, State$, Ticker, Collision } from './interface';

const App: React.FC = () => {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    breakoutGame();
  }, []);


  const breakoutGame = () => {
    // 初始化canvas
    const stage = canvasRef.current as HTMLCanvasElement; // 最外层幕布DOM
    const { width: stageWidth, height: stageHeight } = stage; // 获取幕布的宽高
    const context = stage.getContext('2d') as CanvasRenderingContext2D;
    context.fillStyle = 'skyblue';

    // 绘制开始游戏面板
    const drawIntro = () => {
      context.clearRect(0, 0, stageWidth, stageHeight);
      context.textAlign = 'center';
      context.font = '24px Courier New';
      context.fillText('Press [<] and [>]', stageWidth / 2, stageHeight / 2);
    }

    // 绘制游戏结束面板,结束原因文本由content控制
    const drawGameOver = (content: string) => {
      context.clearRect(stageWidth / 4, stageHeight / 3, stageWidth / 2, stageHeight / 3);
      context.textAlign = 'center';
      context.font = '24px Courier New';
      context.fillText(content, stageWidth / 2, stageHeight / 2);
    }

    // 绘制分数
    const drawScore = (score: number) => {
      context.textAlign = 'left';
      context.font = '16px Courier New';
      context.fillText(score.toString(), BRICK_GAP, 16);
    }

    // 绘制底部滑板
    const drawPaddle = (position: number) => {
      context.beginPath();
      context.rect(
        position - PADDLE_WIDTH / 2,
        stageHeight - PADDLE_HEIGHT,
        PADDLE_WIDTH,
        PADDLE_HEIGHT
      );
      context.fill();
      context.closePath();
    }

    // 绘制圆球
    const drawBall = (ball: Ball) => {
      context.beginPath();
      context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.closePath();
    }

    // 绘制砖块
    const drawBrick = (brink: Brick) => {
      context.beginPath();
      context.rect(
        brink.x - brink.width / 2,
        brink.y - brink.height / 2,
        brink.width,
        brink.height,
      );
      context.fill();
      context.closePath();
    }

    // 遍历绘制砖块
    const drawBricks = (brinks: Brick[]) => {
      for (const brink of brinks) {
        drawBrick(brink);
      }
    }

    // 控制游戏节奏的时钟
    const tickers$: Ticker$ = interval(TICKER_INTERVAL, animationFrameScheduler).pipe(
      map(() => ({
        time: Date.now(),
        deltaTime: 0,
      })),
      scan((previous, current) => ({
        time: current.time,
        deltaTime: (current.time - previous.time) / 1000
      }))
    )

    const keyDown$ = fromEvent<KeyboardEvent>(document, 'keydown');
    const keyUp$ = fromEvent<KeyboardEvent>(document, 'keyup');


    // 监听键盘事件
    const key$: Observable<number> = merge(
      keyDown$.pipe(filter(event => event.key === 'ArrowLeft'), mapTo(ARROW_LEFT)),
      keyDown$.pipe(filter(event => event.key === 'ArrowRight'), mapTo(ARROW_RIGHT)),
      keyUp$.pipe(mapTo(0))
    ).pipe(
      distinctUntilChanged(), // 防止出现连续重复数据
    )

    // 产生底部滑板位置的事件流
    // 使用函数而不是一个流的原因是游戏重新开始的时候应该产生一个新的流
    const createPaddle$ = (ticker$: Ticker$): Paddle$ => ticker$.pipe(
      withLatestFrom(key$), // 键盘事件和游戏节奏合并起来: [{time: xxx, deltaTime: xxx}, direction]
      scan((position, [ticker, direction]: [Ticker, number]) => {      
        const nextPosition = position + direction * ticker.deltaTime  * PADDLE_SPEED;
        // 滑板位置横坐标不能小于过PADDLE_WIDTH / 2或大于stageWidth - PADDLE_WIDTH / 2，否则滑板超出幕布之外
        return Math.max(
          Math.min(nextPosition, stageWidth - PADDLE_WIDTH / 2),
          PADDLE_WIDTH / 2
        )
      }, stageWidth / 2),
      distinctUntilChanged()
    )

    // 判断小球是否触碰到底部滑板
    // y轴判断BALL_RADIUS / 2是为了小球嵌进去弹出来的效果
    const isHit = (paddle: number, ball: Ball): boolean => {
      return ball.position.x > paddle - PADDLE_WIDTH / 2 
        && ball.position.x < paddle + PADDLE_WIDTH / 2
        && ball.position.y > stageHeight - PADDLE_HEIGHT - BALL_RADIUS / 2  
    }

    // 判断小球是否触碰到砖块
    // 这里加上ball.direction.x 是为了要让球更接近
    const isCollision = (brick: Brick, ball: Ball): boolean => {
      return ball.position.x + ball.direction.x > brick.x - brick.width / 2
      && ball.position.x + ball.direction.x < brick.x + brick.width / 2
      && ball.position.y + ball.direction.y > brick.y - brick.height / 2
      && ball.position.y + ball.direction.y < brick.y + brick.height / 2;
    }

    // 渲染所有砖块
    const createBricks = (): Brick[] => {
      const width = (stageWidth - BRICK_GAP - BRICK_COLUMNS * BRICK_GAP) / BRICK_COLUMNS;
      const bricks = [];
      for (let i = 0; i < BRICK_ROWS; i++) {
        for (let j = 0; j < BRICK_COLUMNS; j++) {
          bricks.push({
            x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
            y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20,
            width,
            height: BRICK_HEIGHT
          })
        }
      }
      return bricks;
    }

    // 渲染球，砖块，分数初始状态
    const initState = (): State => ({
      ball: {
        position: {
          x: stageWidth / 2,
          y: stageHeight / 2,
        },
        direction: {
          x: 2,
          y: 2,
        }
      },
      bricks: createBricks(),
      score: 0,
    })

    // 创建整个游戏的状态流
    const createState = (ticker$: Ticker$, paddle$: Paddle$): State$ => ticker$.pipe(
      withLatestFrom(paddle$),
      scan((state: State, [ticker, paddle]: [Ticker, number]) => {
        let { ball, bricks, score } = state;
        const remainingBricks = [];
        // 声明碰撞各种物体的状态
        const collision: Collision = {
          paddle: false,
          floor: false,
          wall: false,
          ceiling: false,
          brick: false,
        }

        //更新球的位置
        ball.position.x = ball.position.x + ball.direction.x * ticker.deltaTime * BALL_SPEED;
        ball.position.y = ball.position.y + ball.direction.y * ticker.deltaTime * BALL_SPEED;

        // 判断是否碰到了砖块
        for (const brick of bricks) {
          if (!isCollision(brick, ball)) {
            remainingBricks.push(brick);
          } else {
            score = score + 10;
            collision.brick = true;
          }
        }

        // 判断球是否碰到了底部滑板
        collision.paddle = isHit(paddle, ball);

        // 判断球是否碰到了左右墙壁
        if (ball.position.x < BALL_RADIUS || ball.position.x > stageWidth - BALL_RADIUS) {
          ball.direction.x = - ball.direction.x;
          collision.wall = true;
        }

        // 判断球是否碰到了天花板
        collision.ceiling = ball.position.y < BALL_RADIUS;

        // 改变球的垂直移动方向
        if (collision.brick || collision.paddle || collision.ceiling) {
          ball.direction.y = - ball.direction.y;
        }

        return {
          ball,
          bricks: remainingBricks,
          score,
        }

      }, initState())
    )

    // 开始游戏
    function updateView([ticker, paddle, {ball, score, bricks}]: [Ticker, number, State]) {
      context.clearRect(0, 0, stageWidth, stageHeight)

      drawPaddle(paddle);
      drawBall(ball);
      drawBricks(bricks);
      drawScore(score);

      if (ball.position.y > stageHeight - BALL_RADIUS) {
        drawGameOver('GAME OVER')
        restart$.error('game over')
      }

      if (bricks.length === 0) {
        drawGameOver('Congradulations!')
        restart$.error('cong')
      }
    }

    let restart$: Subject<number>;

    // 开始游戏界面
    const game$ = new Observable(observer => {
      drawIntro();

      restart$ = new Subject();

      const paddle$ = createPaddle$(tickers$);
      const state$ = createState(tickers$, paddle$);

      merge(tickers$, restart$).pipe(
        withLatestFrom(paddle$, state$),
      ).subscribe(observer);
    }) 

    game$.pipe(
      retryWhen(err$ => err$.pipe(delay(1000)))
    ).subscribe(updateView as any);

  }  



  return (
    <div>
      <canvas width={480} height={320} ref={canvasRef}></canvas>
    </div>
  )
}

export default App;
