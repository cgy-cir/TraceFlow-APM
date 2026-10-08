package io.traceflow;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@MapperScan("io.traceflow")
@EnableScheduling
public class TraceflowServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(TraceflowServerApplication.class, args);
	}

}
