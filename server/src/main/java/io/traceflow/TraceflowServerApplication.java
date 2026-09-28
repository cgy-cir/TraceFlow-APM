package io.traceflow;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("io.traceflow")
public class TraceflowServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(TraceflowServerApplication.class, args);
	}

}
